import { getApiFormat, getGeminiModelsEndpoint, getOpenAiModelsEndpoint } from './profile-endpoints.js';

function uniqSorted(items) {
    return [...new Set(items.map(item => String(item || '').trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
}

function normalizeOpenAiModels(data) {
    const items = Array.isArray(data?.data) ? data.data : [];
    return uniqSorted(items.map(item => item?.id));
}

function normalizeGeminiModels(data) {
    const items = Array.isArray(data?.models) ? data.models : [];
    return uniqSorted(items
        .filter(item => Array.isArray(item?.supportedGenerationMethods)
            && item.supportedGenerationMethods.includes('generateContent'))
        .map(item => item?.baseModelId || String(item?.name || '').replace(/^models\//, '')));
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || `拉取模型失败：${response.status}`);
    }
    return data;
}

async function fetchOpenAiModels(profile, apiKey) {
    const data = await fetchJson(getOpenAiModelsEndpoint(profile.baseUrl), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        cache: 'no-cache',
    });
    return normalizeOpenAiModels(data);
}

async function fetchGeminiModels(profile, apiKey) {
    const endpoint = new URL(getGeminiModelsEndpoint(profile.baseUrl));
    endpoint.searchParams.set('key', apiKey);
    endpoint.searchParams.set('pageSize', '1000');
    const data = await fetchJson(endpoint.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-cache',
    });
    return normalizeGeminiModels(data);
}

export async function fetchProfileModels(profile) {
    const baseUrl = String(profile.baseUrl || '').trim();
    const apiKey = String(profile.apiKey || '').trim();
    if (!baseUrl || !apiKey) {
        throw new Error('拉取模型前需要先填写 Base URL 和 API Key');
    }

    return getApiFormat(profile) === 'gemini'
        ? await fetchGeminiModels(profile, apiKey)
        : await fetchOpenAiModels(profile, apiKey);
}
