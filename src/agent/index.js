const chalk = require("chalk")
const llm = require("../llm")
const shell = require("./tools/shell")
const writeFile = require("./tools/write_file")
const readFile = require("./tools/read_file")
const readSkill = require("./tools/read_skill")
const webFetch = require("./tools/web_fetch")
const remember = require("./tools/remember")
const endSession = require("./tools/end_session")
const skills = require("./skills")
const sessionStore = require("../utils/session")
const { renderSessionPrompt } = require("../utils/session-prompt")
const { archiveExpiredSession } = require("../utils/session-archive")
const {
  sendMessage,
  startTyping,
  createStreamer,
} = require("../utils/telegram")
const { formatCommandSuccess } = require("../utils/command-result")
const { logError, logOp } = require("../utils/logger")

const buildSystemPrompt = require("./system-prompt")

function getEnvInt(name, fallback) {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`)
const MAX_ROUNDS = getEnvInt("AGENT_MAX_ROUNDS", 5)
const SESSION_COMPACT_TRIGGER_CHARS = sessionStore.COMPACT_TRIGGER_CHARS
const BASE_SYSTEM_PROMPT = buildSystemPrompt(
  process.env.PROJECT_ROOT,
  MAX_ROUNDS,
)

async function handle(chatId, text, sender, userId) {
  logOp("user.message", { chatId, userId, sender, text })
  console.log(
    `${timestamp()} ${chalk.bgBlue.white(" AGENT ")} ${chalk.cyan(text.slice(0, 60))} ${chalk.dim(`@${sender}`)}`,
  )

  const stopTyping = startTyping(chatId)
  try {
    await archiveExpiredSession(chatId, {
      userId,
      onProgress: (event) => sendArchiveProgress(chatId, event, { phase: "ttl" }),
    })
    sessionStore.appendHistory(chatId, "user", text)

    const availableSkills = skills.load()
    const session = await loadSessionForPrompt(chatId)
    const systemPrompt =
      BASE_SYSTEM_PROMPT + skills.indexText() + renderSessionPrompt(session)
    const tools = [
      shell.definition,
      writeFile.definition,
      readFile.definition,
      webFetch.definition,
      remember.definition,
      endSession.definition,
    ]
    if (availableSkills.length > 0) tools.push(readSkill.definition)

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ]

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const streamer = createStreamer(chatId)
      const onToken = (chunk) => {
        streamer.onToken(chunk)
        // logOp("bot.chunk", { chatId, chunk, round })
      }
      const reply = await llm.chatStream({ messages, tools }, onToken)
      messages.push(reply)

      const content = (reply.content || "").trim()
      const toolCalls = reply.tool_calls || []

      if (content) {
        await streamer.finalize()
        logOp("bot.reply", {
          chatId,
          text: content,
          phase: "llm.content",
          round,
        })
        console.log(
          `${timestamp()} ${chalk.bgGreen.black(" SAY ")} ${chalk.dim(content.slice(0, 60))}`,
        )
        sessionStore.appendHistory(chatId, "assistant", content)
      } else {
        streamer.discard()
      }

      if (toolCalls.length === 0) {
        if (!content) {
          const fallback = "（LLM 沒有回覆）"
          await sendMessage(chatId, fallback)
          logOp("bot.reply", { chatId, text: fallback, phase: "empty", round })
        }
        return
      }

      let shouldTerminate = false
      for (const call of toolCalls) {
        const name = call.function?.name
        const args = safeParse(call.function?.arguments)

        if (name === "read_skill") {
          await handleReadSkill({ chatId, call, args, round, messages })
        } else if (name === "write_file") {
          await handleWriteFile({ chatId, call, args, round, messages })
        } else if (name === "read_file") {
          await handleReadFile({ chatId, call, args, round, messages })
        } else if (name === "web_fetch") {
          await handleWebFetch({ chatId, call, args, round, messages })
        } else if (name === "remember") {
          await handleRemember({ chatId, call, args, round, messages })
        } else if (name === "end_session") {
          await handleEndSession({ chatId, call, round, messages })
        } else if (name === "exec_shell") {
          const isFinal = args.final === true
          const allowFinal = toolCalls.length === 1
          const shouldStop = await handleExecShell({
            chatId,
            call,
            args,
            round,
            messages,
            isFinal,
            allowFinal,
          })
          if (shouldStop) shouldTerminate = true
        } else {
          logOp("tool.unknown", { name, round })
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Unknown tool: ${name}`,
          })
        }
      }

      if (shouldTerminate) return
    }

    await forceFinalSummary({ chatId, messages, tools })
  } catch (err) {
    console.error(
      `${timestamp()} ${chalk.bgRed.white(" ERR ")} ${chalk.red(err.message)}`,
    )
    logError("AGENT", err.message)
    await sendMessage(chatId, `Agent 錯誤：${err.message}`)
  } finally {
    stopTyping()
  }
}

async function handleReadSkill({ chatId, call, args, round, messages }) {
  const skillName = args.name || ""
  console.log(
    `${timestamp()} ${chalk.bgMagenta.white(" SKILL ")} ${chalk.magenta(skillName)}`,
  )
  logOp("tool.call", { name: "read_skill", args, round })

  const pre = `📖 讀取 skill: \`${skillName}\``
  await sendMessage(chatId, pre)
  logOp("bot.reply", { chatId, text: pre, phase: "skill.read", round })

  const { ok, body } = readSkill.run(skillName)
  logOp("tool.result", { name: "read_skill", skillName, ok, round })
  if (ok) sessionStore.markActiveSkill(chatId, skillName)
  messages.push({ role: "tool", tool_call_id: call.id, content: body })
}

async function handleWebFetch({ chatId, call, args, round, messages }) {
  const url = args.url || ""
  const render = args.render || "auto"
  console.log(
    `${timestamp()} ${chalk.bgCyan.black(" FETCH ")} ${chalk.cyan(url)}`,
  )
  logOp("tool.call", { name: "web_fetch", url, render, round })

  const pre = `🌐 抓取網頁: ${url}`
  await sendMessage(chatId, pre)
  logOp("bot.reply", { chatId, text: pre, phase: "fetch.pre", round })

  const { ok, text, status, mode } = await webFetch.run(url, { render })
  logOp("tool.result", {
    name: "web_fetch",
    url,
    ok,
    status,
    mode,
    length: text.length,
    round,
  })
  messages.push({ role: "tool", tool_call_id: call.id, content: text })
}

async function handleWriteFile({ chatId, call, args, round, messages }) {
  const targetPath = args.path || ""
  const cwd = args.cwd || ""
  const content = args.content || ""
  const location = cwd ? ` @ ${cwd}` : ""
  console.log(
    `${timestamp()} ${chalk.bgGreen.black(" WRITE ")} ${chalk.green(targetPath)}${chalk.dim(location)}`,
  )
  logOp("tool.call", {
    name: "write_file",
    path: targetPath,
    cwd: cwd || undefined,
    contentLength: content.length,
    round,
  })

  const pre = cwd
    ? `📝 寫入檔案: \`${targetPath}\`\n📁 cwd: \`${cwd}\``
    : `📝 寫入檔案: \`${targetPath}\``
  await sendMessage(chatId, pre)
  logOp("bot.reply", { chatId, text: pre, phase: "write.pre", round })

  const { ok, body, path, bytes } = writeFile.run(targetPath, content, { cwd })
  logOp("tool.result", {
    name: "write_file",
    path: path || targetPath,
    cwd: cwd || undefined,
    ok,
    bytes,
    round,
  })
  messages.push({ role: "tool", tool_call_id: call.id, content: body })
}

async function handleReadFile({ chatId, call, args, round, messages }) {
  const targetPath = args.path || ""
  const cwd = args.cwd || ""
  const offset = args.offset
  const limit = args.limit
  const location = cwd ? ` @ ${cwd}` : ""
  console.log(
    `${timestamp()} ${chalk.bgCyan.black(" READ ")} ${chalk.cyan(targetPath)}${chalk.dim(location)}`,
  )
  logOp("tool.call", {
    name: "read_file",
    path: targetPath,
    cwd: cwd || undefined,
    offset,
    limit,
    round,
  })

  const rangeHint =
    offset || limit ? ` (offset=${offset || 1}, limit=${limit || "預設"})` : ""
  const pre = cwd
    ? `📄 讀取檔案: \`${targetPath}\`${rangeHint}\n📁 cwd: \`${cwd}\``
    : `📄 讀取檔案: \`${targetPath}\`${rangeHint}`
  await sendMessage(chatId, pre)
  logOp("bot.reply", { chatId, text: pre, phase: "read.pre", round })

  const {
    ok,
    body,
    path: resolvedPath,
    totalLines,
    bytes,
  } = readFile.run(targetPath, { cwd, offset, limit })
  logOp("tool.result", {
    name: "read_file",
    path: resolvedPath || targetPath,
    cwd: cwd || undefined,
    ok,
    totalLines,
    bytes,
    round,
  })
  messages.push({ role: "tool", tool_call_id: call.id, content: body })
}

async function handleRemember({ chatId, call, args, round, messages }) {
  const fields = args.fields || {}
  const keys = Object.keys(fields)
  console.log(
    `${timestamp()} ${chalk.bgBlue.white(" MEM ")} ${chalk.blue(`remember ${keys.join(",")}`)}`,
  )
  logOp("tool.call", { name: "remember", keys, round })

  const pre = `🧠 鎖定欄位: ${keys.join(", ") || "(空)"}`
  await sendMessage(chatId, pre)
  logOp("bot.reply", { chatId, text: pre, phase: "mem.remember", round })

  const { ok, body } = remember.run(chatId, fields)
  logOp("tool.result", { name: "remember", keys, ok, round })
  messages.push({ role: "tool", tool_call_id: call.id, content: body })
}

async function handleEndSession({ chatId, call, round, messages }) {
  console.log(
    `${timestamp()} ${chalk.bgBlue.white(" MEM ")} ${chalk.blue("end_session")}`,
  )
  logOp("tool.call", { name: "end_session", round })

  const { ok, body } = await endSession.run(chatId, {
    onProgress: (event) =>
      sendArchiveProgress(chatId, event, { phase: "end_session", round }),
  })
  logOp("tool.result", { name: "end_session", ok, round })
  messages.push({ role: "tool", tool_call_id: call.id, content: body })
}

async function sendArchiveProgress(chatId, event, { phase, round } = {}) {
  const text = formatArchiveProgress(event)
  if (!text) return
  await sendMessage(chatId, text)
  logOp("bot.reply", {
    chatId,
    text,
    phase: `memory.archive.${phase || event.stage}`,
    round,
  })
}

function formatArchiveProgress(event) {
  if (event.stage === "ttl_detected") {
    return "🗂️ 先前 session 已過期，正在整理成記憶摘要。"
  }
  if (event.stage === "summarizing") {
    const size = event.rawChars ? `（約 ${event.rawChars} 字，${event.historyCount || 0} 則對話）` : ""
    return `🧠 正在請 LLM 摘要目前 session ${size}。`
  }
  if (event.stage === "writing") {
    return "💾 摘要完成，正在寫入記憶歷史。"
  }
  if (event.stage === "done") {
    return `✅ 記憶已歸檔 #${event.id}。`
  }
  if (event.stage === "failed") {
    return `⚠️ 記憶歸檔失敗，已保留原 session。\n原因：${event.reason || "未知原因"}`
  }
  return ""
}

async function handleExecShell({
  chatId,
  call,
  args,
  round,
  messages,
  isFinal,
  allowFinal,
}) {
  const command = args.command || ""
  const cwd = args.cwd || ""
  const location = cwd ? ` @ ${cwd}` : ""
  const shouldPresentFinal = isFinal && allowFinal
  const tag = shouldPresentFinal ? " TOOL! " : " TOOL* "
  console.log(
    `${timestamp()} ${chalk.bgYellow.black(tag)} ${chalk.yellow(command)}${chalk.dim(location)}`,
  )
  logOp("tool.call", {
    name: "exec_shell",
    command,
    cwd: cwd || undefined,
    final: isFinal,
    allowFinal,
    round,
  })

  const pre = formatExecShellPre(command, cwd, shouldPresentFinal)
  await sendMessage(chatId, pre)
  logOp("bot.reply", { chatId, text: pre, phase: "tool.pre", round })

  const { ok, output, cwd: resolvedCwd } = await shell.run(command, { cwd })
  logOp("tool.result", {
    name: "exec_shell",
    command,
    cwd: resolvedCwd || cwd || undefined,
    ok,
    output,
    final: isFinal,
    allowFinal,
    round,
  })

  const shouldContinue =
    !shouldPresentFinal || !ok || isRecoverableEmptyShellResult(command, output)
  if (shouldContinue) {
    const body = formatExecShellFollowupAck(
      ok,
      command,
      resolvedCwd || cwd,
      output,
    )
    await sendMessage(chatId, body)
    logOp("bot.reply", {
      chatId,
      text: body,
      phase: "tool.progress",
      round,
    })

    const toolContent = ok ? `exit=0\n${output}` : `exit!=0\n${output}`
    messages.push({ role: "tool", tool_call_id: call.id, content: toolContent })
    return false
  }

  const body = ok
    ? formatCommandSuccess({ command, cwd: resolvedCwd || cwd, output })
    : `⚠️ 指令執行失敗\n\`\`\`\n${output}\n\`\`\``
  await sendMessage(chatId, body)
  logOp("bot.reply", { chatId, text: body, phase: "tool.result", round })
  return true
}

function formatExecShellPre(command, cwd, final) {
  if (final) {
    return cwd
      ? `🔧 執行中: \`${command}\`\n📁 cwd: \`${cwd}\``
      : `🔧 執行中: \`${command}\``
  }

  const action = describeShellAction(command)
  const cwdLine = cwd ? `\n📁 cwd: \`${cwd}\`` : ""
  return `${action.icon} ${action.label}: \`${command}\`${cwdLine}`
}

function describeShellAction(command) {
  if (isLikelyShellRead(command)) return { icon: "🔎", label: "查閱中" }
  if (isLikelyShellWrite(command)) return { icon: "🛠️", label: "處理中" }
  return { icon: "🔧", label: "執行中" }
}

function isLikelyShellRead(command) {
  return /^\s*(pwd|ls|find|rg|grep|cat|sed\s+-n|head|tail|wc|git\s+(status|diff|show|log)|npm\s+(test|run)|node\s+--check)\b/.test(
    command,
  )
}

function isEmptyShellOutput(output) {
  const text = String(output || "").trim()
  return !text || text === "（無輸出）"
}

function isLikelyShellSearch(command) {
  return /^\s*(find|rg|grep)\b/.test(command)
}

function isRecoverableEmptyShellResult(command, output) {
  return isEmptyShellOutput(output) && isLikelyShellSearch(command)
}

function isLikelyShellWrite(command) {
  return /(^|\s)(>|>>)|\b(tee|mkdir|touch|mv|cp|npm\s+install|npm\s+link|git\s+add|git\s+commit)\b/.test(
    command,
  )
}

function formatExecShellFollowupAck(ok, command, cwd, output) {
  const action = describeShellAction(command)
  const cwdLine = cwd ? `\n📁 cwd: \`${cwd}\`` : ""
  if (!ok) return `⚠️ 中間步驟失敗，交由 LLM 判斷下一步。${cwdLine}`
  if (isRecoverableEmptyShellResult(command, output)) {
    return `🔎 查無結果，交由 LLM 調整查法。${cwdLine}`
  }
  if (action.label === "查閱中")
    return `🔎 已取得查閱結果，繼續處理。${cwdLine}`
  if (action.label === "處理中")
    return `🛠️ 已完成中間處理，繼續檢查。${cwdLine}`
  return `🔧 已取得中間結果，繼續處理。${cwdLine}`
}

async function forceFinalSummary({ chatId, messages, tools }) {
  logOp("agent.max_rounds", { chatId })
  console.log(
    `${timestamp()} ${chalk.bgRed.white(" MAX ")} ${chalk.red(`撞 ${MAX_ROUNDS} 輪上限，強制總結`)}`,
  )

  messages.push({
    role: "user",
    content: `[系統提示] 已達互動上限 ${MAX_ROUNDS} 輪，禁止再呼叫任何工具。請根據目前已蒐集的資料，直接用繁體中文文字回覆。若資料不足以完整回答，也請誠實說明並給出目前能給的最佳回覆。`,
  })

  await sendMessage(chatId, `⚠️ 已達互動上限，整理回覆中…`)
  const streamer = createStreamer(chatId)
  const finalReply = await llm.chatStream(
    { messages, tools, toolChoice: "none" },
    streamer.onToken,
  )
  const content = (finalReply.content || "").trim()
  if (content) {
    await streamer.finalize()
  } else {
    streamer.discard()
    await sendMessage(
      chatId,
      `⚠️ 已達互動上限 ${MAX_ROUNDS}，且無法從現有資料產出總結。`,
    )
  }
  logOp("bot.reply", { chatId, text: content, phase: "max_rounds.summary" })
  if (content) sessionStore.appendHistory(chatId, "assistant", content)
}

async function loadSessionForPrompt(chatId) {
  const session = sessionStore.loadSession(chatId)
  const prompt = renderSessionPrompt(session)
  if (!session || prompt.length <= SESSION_COMPACT_TRIGGER_CHARS) return session

  logOp("session.compact.start", {
    chatId,
    promptChars: prompt.length,
    triggerChars: SESSION_COMPACT_TRIGGER_CHARS,
  })
  console.log(
    `${timestamp()} ${chalk.bgBlue.white(" MEM ")} ${chalk.blue(`compact ${prompt.length}/${SESSION_COMPACT_TRIGGER_CHARS}`)}`,
  )

  const reply = await llm.chat({
    messages: [
      {
        role: "system",
        content:
          "你負責壓縮 Telegram agent 的短期記憶。請保留可延續任務所需的事實、用戶意圖、已確認內容、目前進度、待辦與限制。刪除寒暄、重複語句與中間失敗嘗試。只輸出繁體中文摘要，不要使用 Markdown 標題。",
      },
      {
        role: "user",
        content: `請將以下 session 壓縮成可放入 locked.summary 的摘要，控制在 1200 字內：\n${JSON.stringify(session, null, 2)}`,
      },
    ],
  })

  const summary = (reply.content || "").trim()
  if (!summary) {
    throw new Error("記憶壓縮失敗：LLM 沒有回傳摘要")
  }

  const compacted = sessionStore.compactSession(chatId, summary)
  logOp("session.compact.done", {
    chatId,
    promptChars: prompt.length,
    summaryChars: summary.length,
  })
  return compacted
}

function safeParse(s) {
  try {
    return JSON.parse(s || "{}")
  } catch {
    return {}
  }
}

module.exports = { handle }
