import { buildGenerationPrompt } from './prompt-builder.js';
import { getApiFormat, normalizeGeminiBaseUrl, normalizeOpenAiBaseUrl } from './profile-endpoints.js';
import { getSystemPrompt } from './prompt-schema.js';

function getOpenAiEndpoint(baseUrl) {
    return `${normalizeOpenAiBaseUrl(baseUrl)}/chat/completions`;
}

function getGeminiEndpoint(baseUrl, model) {
    return `${normalizeGeminiBaseUrl(baseUrl)}/models/${encodeURIComponent(model)}:generateContent`;
}

function getStreamGeminiEndpoint(baseUrl, model) {
    return `${normalizeGeminiBaseUrl(baseUrl)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
}

function buildRequestSnapshot(profile, mode, prompt, options = {}) {
    const model = String(profile.model || '').trim();
    const apiFormat = getApiFormat(profile);
    const systemPrompt = getSystemPrompt(mode);
    const stream = Boolean(options.stream);
    if (apiFormat === 'gemini') {
        return {
            mode,
            apiFormat,
            stream,
            endpoint: stream ? getStreamGeminiEndpoint(profile.baseUrl, model) : getGeminiEndpoint(profile.baseUrl, model),
            body: {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
            },
        };
    }

    return {
        mode,
        apiFormat,
        stream,
        endpoint: getOpenAiEndpoint(profile.baseUrl),
        body: {
            model,
            stream,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
        },
    };
}

function getRequestHeaders(apiFormat, apiKey) {
    return apiFormat === 'gemini'
        ? { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
        : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
}

function getResponseText(apiFormat, data) {
    if (apiFormat === 'gemini') {
        return (data?.candidates?.[0]?.content?.parts || [])
            .map(part => typeof part?.text === 'string' ? part.text : '')
            .join('')
            .trim();
    }

    return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
}

function createDebugError(message, debugRequest, debugResponse = null) {
    const error = new Error(message);
    error.debugRequest = debugRequest;
    error.debugResponse = debugResponse;
    return error;
}

function getStreamChunkText(apiFormat, payload) {
    if (apiFormat === 'gemini') {
        return getResponseText(apiFormat, payload);
    }

    const choice = payload?.choices?.[0];
    if (typeof choice?.delta?.content === 'string') {
        return choice.delta.content;
    }

    if (Array.isArray(choice?.delta?.content)) {
        return choice.delta.content
            .map(part => typeof part?.text === 'string' ? part.text : '')
            .join('');
    }

    return getResponseText(apiFormat, payload);
}

function extractSseEvents(buffer) {
    const chunks = buffer.split(/\r?\n\r?\n/);
    const nextBuffer = chunks.pop() || '';
    const events = chunks
        .map(chunk => chunk
            .split(/\r?\n/)
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim())
            .join('\n'))
        .filter(Boolean);
    return { events, nextBuffer };
}

async function readStreamResponse(response, requestSnapshot, options = {}) {
    const reader = response.body?.getReader();
    if (!reader) {
        throw createDebugError('私有 API 流式响应不可读', requestSnapshot);
    }

    const decoder = new TextDecoder();
    const debugEvents = [];
    let buffer = '';
    let content = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = extractSseEvents(buffer);
        buffer = parsed.nextBuffer;

        for (const event of parsed.events) {
            if (event === '[DONE]') {
                continue;
            }

            let payload;
            try {
                payload = JSON.parse(event);
            } catch (error) {
                throw createDebugError(`流式响应片段解析失败：${error.message}`, requestSnapshot, { rawEvent: event });
            }

            debugEvents.push(payload);
            const chunk = getStreamChunkText(requestSnapshot.apiFormat, payload);
            if (!chunk) {
                continue;
            }

            content += chunk;
            options.onChunk?.(content, chunk, payload);
        }
    }

    if (!content.trim()) {
        throw createDebugError('私有 API 未返回可用内容', requestSnapshot, { streamed: true, events: debugEvents });
    }

    return {
        content: content.trim(),
        debugRequest: requestSnapshot,
        debugResponse: { streamed: true, eventCount: debugEvents.length, events: debugEvents },
    };
}

export function buildGenerationRequest(profile, input, mode, options = {}) {
    const model = String(profile.model || '').trim();
    const prompt = buildGenerationPrompt(mode, input);

    if (!profile.baseUrl || !model || !String(profile.apiKey || '').trim()) {
        throw new Error('私有 API 配置不完整，需要格式、Base URL、模型和 API Key');
    }

    return buildRequestSnapshot(profile, mode, prompt, options);
}

export async function generateWithPrivateApi(requestSnapshot, apiKey, options = {}) {
    const normalizedApiKey = String(apiKey || '').trim();
    if (!normalizedApiKey) {
        throw new Error('私有 API 配置不完整，需要格式、Base URL、模型和 API Key');
    }

    console.info('[GCG] private API request prepared', {
        apiFormat: requestSnapshot.apiFormat,
        endpoint: requestSnapshot.endpoint,
        model: requestSnapshot.body?.model || '',
        promptLength: JSON.stringify(requestSnapshot.body || {}).length,
        bodyKeys: Object.keys(requestSnapshot.body || {}),
    });

    const response = await fetch(requestSnapshot.endpoint, {
        method: 'POST',
        headers: getRequestHeaders(requestSnapshot.apiFormat, normalizedApiKey),
        body: JSON.stringify(requestSnapshot.body),
        signal: options.signal,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw createDebugError(
            `私有 API 请求失败：${response.status} ${errorText || response.statusText}`,
            requestSnapshot,
            { status: response.status, statusText: response.statusText, body: errorText || '' },
        );
    }

    if (requestSnapshot.stream) {
        return readStreamResponse(response, requestSnapshot, options);
    }

    const data = await response.json();
    const content = getResponseText(requestSnapshot.apiFormat, data);
    if (!content) {
        throw createDebugError('私有 API 未返回可用内容', requestSnapshot, data);
    }
    return { content, debugRequest: requestSnapshot, debugResponse: data };
}
