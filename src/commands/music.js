const chalk = require('chalk');
const { generateLyrics, generateMusic } = require('../llm/providers/minimax-music');
const { sendAudio, sendMessage, startChatAction } = require('../utils/telegram');
const { logError, logOp } = require('../utils/logger');

const timestamp = () => chalk.gray(`[${new Date().toLocaleTimeString()}]`);
const USAGE = [
    '用法：',
    '`/music <風格描述>`',
    '`/music --instrumental <風格描述>`',
    '',
    '多行輸入時，第一行是風格描述，後面是歌詞。',
].join('\n');

function stripCommand(text) {
    return String(text || '').replace(/^\/music(?:@\w+)?(?:\s+)?/, '').trim();
}

function parseMusicInput(text) {
    const body = stripCommand(text);
    if (!body || body === 'help' || body === '--help') {
        return { ok: false, output: USAGE };
    }

    const instrumentalMatch = body.match(/^--(?:instrumental|inst)\s+([\s\S]+)$/);
    if (instrumentalMatch) {
        const prompt = instrumentalMatch[1].trim();
        if (!prompt) return { ok: false, output: USAGE };
        return { ok: true, prompt, lyrics: '', isInstrumental: true, needsLyricsGeneration: false };
    }

    const lines = body.split(/\r?\n/);
    const prompt = lines.shift().trim();
    const lyrics = lines.join('\n').trim();
    if (!prompt) return { ok: false, output: USAGE };

    return {
        ok: true,
        prompt,
        lyrics,
        isInstrumental: false,
        needsLyricsGeneration: !lyrics,
    };
}

function formatDuration(durationMs) {
    const seconds = Math.round(Number(durationMs || 0) / 1000);
    if (!seconds) return 'unknown';
    const mins = Math.floor(seconds / 60);
    const secs = String(seconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
}

function sanitizeFilenamePart(value) {
    const slug = String(value || '')
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/_+/g, '-')
        .toLowerCase()
        .slice(0, 48);
    return slug || 'music';
}

function timestampForFilename(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

function formatCaption(metadata, result) {
    const mode = metadata.isInstrumental ? 'instrumental' : metadata.generatedLyrics ? 'generated lyrics' : 'provided lyrics';
    const durationMs = Number(result.extraInfo?.music_duration || 0);
    return `${metadata.title || 'LazyHole Music'}\nMiniMax ${result.model} (${mode})\nDuration: ${formatDuration(durationMs)}`;
}

function getAudioName(metadata, result) {
    const ext = result.format || 'mp3';
    return `lazyhole-${sanitizeFilenamePart(metadata.title || metadata.prompt)}-${timestampForFilename()}.${ext}`;
}

function formatResultMessage(metadata, result) {
    const duration = formatDuration(result.extraInfo?.music_duration);
    const title = metadata.title || 'LazyHole Music';
    const style = metadata.styleTags ? `\nStyle: ${metadata.styleTags}` : '';
    const lyrics = metadata.lyrics ? `\n\nLyrics:\n${metadata.lyrics}` : '';
    return `Music ready\nTitle: ${title}${style}\nDuration: ${duration}${lyrics}`;
}

async function handle(chatId, text, sender, userId) {
    const parsed = parseMusicInput(text);
    if (!parsed.ok) {
        await sendMessage(chatId, parsed.output);
        return;
    }

    console.log(`${timestamp()} ${chalk.bgMagenta.white(' MUSIC ')} ${chalk.magenta(parsed.prompt.slice(0, 80))} ${chalk.dim(`@${sender}`)}`);
    logOp('user.message', {
        chatId,
        userId,
        sender,
        text,
        route: 'music',
        instrumental: parsed.isInstrumental,
        needsLyricsGeneration: parsed.needsLyricsGeneration,
    });

    await sendMessage(chatId, parsed.needsLyricsGeneration ? '開始生成歌詞。' : '開始生成音樂。');
    const stopAction = startChatAction(chatId, 'upload_audio');

    try {
        const metadata = {
            prompt: parsed.prompt,
            lyrics: parsed.lyrics,
            title: 'LazyHole Music',
            styleTags: '',
            isInstrumental: parsed.isInstrumental,
            generatedLyrics: false,
        };

        if (parsed.needsLyricsGeneration) {
            const lyricResult = await generateLyrics({ prompt: parsed.prompt });
            metadata.title = lyricResult.songTitle;
            metadata.styleTags = lyricResult.styleTags;
            metadata.lyrics = lyricResult.lyrics;
            metadata.generatedLyrics = true;
            await sendMessage(chatId, '歌詞已產出，開始生成音樂。');
        }

        const result = await generateMusic({
            prompt: parsed.prompt,
            lyrics: metadata.lyrics,
            isInstrumental: parsed.isInstrumental,
            lyricsOptimizer: false,
            outputFormat: 'hex',
        });

        await sendMessage(chatId, formatResultMessage(metadata, result));
        await sendAudio(chatId, result.audio, {
            caption: formatCaption(metadata, result),
            title: metadata.title,
            performer: 'MiniMax',
            filename: getAudioName(metadata, result),
            mimeType: result.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
        });

        console.log(`${timestamp()} ${chalk.bgGreen.black(' OK  ')} ${chalk.dim(`music ${result.type} ${result.traceId || ''}`)}`);
        logOp('bot.reply', { chatId, route: 'music', resultType: result.type, traceId: result.traceId });
    } catch (err) {
        const reason = err.response?.data?.base_resp?.status_msg
            || err.response?.data?.message
            || err.response?.data?.description
            || err.message;
        console.log(`${timestamp()} ${chalk.bgRed.white(' ERR ')} ${chalk.red(reason)}`);
        logError('MUSIC', reason);
        await sendMessage(chatId, `音樂生成失敗：${reason}`);
    } finally {
        stopAction();
    }
}

module.exports = { handle, parseMusicInput };
