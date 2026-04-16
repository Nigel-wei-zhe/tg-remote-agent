const axios = require("axios")
// https://api.minimax.io/v1/chat/completions
// https://api.minimax.io/v1/text/chatcompletion_v2
const ENDPOINT = "https://api.minimax.io/v1/text/chatcompletion_v2"

async function ask(userMessage) {
  const apiKey = process.env.MINIMAX_API_KEY
  const model = process.env.MINIMAX_MODEL || "MiniMax-M2.7"

  const response = await axios.post(
    ENDPOINT,
    {
      model,
      messages: [{ role: "user", name: "User", content: userMessage }],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    },
  )

  const choice = response.data.choices?.[0]
  if (!choice) throw new Error("API 未回傳任何結果。")
  return choice.message.content
}

module.exports = { ask }
