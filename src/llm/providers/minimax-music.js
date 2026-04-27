const axios = require('axios');
const { logOp } = require('../../utils/logger');

const MUSIC_ENDPOINT = 'https://api.minimax.io/v1/music_generation';
const LYRICS_ENDPOINT = 'https://api.minimax.io/v1/lyrics_generation';
const DEFAULT_MODEL = 'music-2.6';
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_AUDIO_SETTING = {
    sample_rate: 44100,
    bitrate: 256000,
    format: 'mp3',
};

function createMiniMaxMusicError(message, extra = {}) {
    const err = new Error(message || 'MiniMax music 回傳錯誤');
    Object.assign(err, extra);
    return err;
}

function getStatusMessage(data) {
    return data?.base_resp?.status_msg || data?.message || 'MiniMax music 請求失敗';
}

function getApiKey() {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
        throw createMiniMaxMusicError('缺少 MINIMAX_API_KEY。', { isMiniMaxMusicError: true });
    }
    return apiKey;
}

function parseHexAudio(hex) {
    if (typeof hex !== 'string' || !hex) return null;
    return Buffer.from(hex, 'hex');
}

function normalizeAudioResult(data, format) {
    const audio = data?.data?.audio;
    if (!audio) {
        throw createMiniMaxMusicError('MiniMax music 未回傳音檔。', { isMiniMaxMusicError: true });
    }

    if (typeof audio === 'string' && /^https?:\/\//i.test(audio)) {
        return { type: 'url', audio, format };
    }

    const buffer = parseHexAudio(audio);
    if (!buffer || buffer.length === 0) {
        throw createMiniMaxMusicError('MiniMax music 音檔格式無法解析。', { isMiniMaxMusicError: true });
    }

    return { type: 'buffer', audio: buffer, format };
}

function buildPayload(options) {
    const audioSetting = { ...DEFAULT_AUDIO_SETTING, ...(options.audioSetting || {}) };
    const payload = {
        model: process.env.MINIMAX_MUSIC_MODEL || DEFAULT_MODEL,
        prompt: options.prompt,
        output_format: options.outputFormat || 'url',
        audio_setting: audioSetting,
        lyrics_optimizer: Boolean(options.lyricsOptimizer),
        is_instrumental: Boolean(options.isInstrumental),
    };

    if (options.lyrics) payload.lyrics = options.lyrics;
    return payload;
}

async function generateMusic(options) {
    const apiKey = getApiKey();
    const payload = buildPayload(options);
    logOp('music.request', {
        provider: 'minimax',
        model: payload.model,
        promptLength: payload.prompt.length,
        lyricsLength: payload.lyrics?.length || 0,
        instrumental: payload.is_instrumental,
        lyricsOptimizer: payload.lyrics_optimizer,
        outputFormat: payload.output_format,
        audioSetting: payload.audio_setting,
    });

    const response = await axios.post(MUSIC_ENDPOINT, payload, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        timeout: DEFAULT_TIMEOUT_MS,
    });

    const statusCode = Number(response.data?.base_resp?.status_code || 0);
    if (statusCode !== 0) {
        throw createMiniMaxMusicError(getStatusMessage(response.data), {
            isMiniMaxMusicError: true,
            statusCode,
            traceId: response.data?.trace_id,
        });
    }

    const result = normalizeAudioResult(response.data, payload.audio_setting.format);
    logOp('music.response', {
        provider: 'minimax',
        model: payload.model,
        traceId: response.data?.trace_id,
        resultType: result.type,
        extraInfo: response.data?.extra_info,
    });

    return {
        ...result,
        model: payload.model,
        traceId: response.data?.trace_id,
        extraInfo: response.data?.extra_info,
    };
}

async function generateLyrics({ prompt, lyrics, title }) {
    const apiKey = getApiKey();
    const payload = {
        mode: lyrics ? 'edit' : 'write_full_song',
        prompt,
    };
    if (lyrics) payload.lyrics = lyrics;
    if (title) payload.title = title;

    logOp('lyrics.request', {
        provider: 'minimax',
        mode: payload.mode,
        promptLength: prompt.length,
        lyricsLength: lyrics?.length || 0,
        hasTitle: Boolean(title),
    });

    const response = await axios.post(LYRICS_ENDPOINT, payload, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        timeout: DEFAULT_TIMEOUT_MS,
    });

    const statusCode = Number(response.data?.base_resp?.status_code || 0);
    if (statusCode !== 0) {
        throw createMiniMaxMusicError(getStatusMessage(response.data), {
            isMiniMaxMusicError: true,
            statusCode,
        });
    }

    const result = {
        songTitle: response.data?.song_title || 'LazyHole Music',
        styleTags: response.data?.style_tags || '',
        lyrics: response.data?.lyrics || '',
    };
    if (!result.lyrics) {
        throw createMiniMaxMusicError('MiniMax lyrics 未回傳歌詞。', { isMiniMaxMusicError: true });
    }

    logOp('lyrics.response', {
        provider: 'minimax',
        songTitle: result.songTitle,
        styleTags: result.styleTags,
        lyricsLength: result.lyrics.length,
    });

    return result;
}

module.exports = { generateLyrics, generateMusic };
