import { DEFAULT_API_FORMAT, DEFAULT_GEMINI_BASE_URL } from '../constants.js';

function trimTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '');
}

export function getApiFormat(profile) {
    return profile?.apiFormat === 'gemini' ? 'gemini' : DEFAULT_API_FORMAT;
}

export function getDefaultBaseUrl(apiFormat) {
    return apiFormat === 'gemini' ? DEFAULT_GEMINI_BASE_URL : '';
}

export function normalizeOpenAiBaseUrl(baseUrl) {
    return trimTrailingSlash(baseUrl).replace(/\/chat\/completions$/i, '');
}

export function getOpenAiModelsEndpoint(baseUrl) {
    return `${normalizeOpenAiBaseUrl(baseUrl)}/models`;
}

export function normalizeGeminiBaseUrl(baseUrl) {
    return trimTrailingSlash(baseUrl).replace(/\/models(?:\/[^/?#]+(?::[a-z]+)?)?$/i, '') || DEFAULT_GEMINI_BASE_URL;
}

export function getGeminiModelsEndpoint(baseUrl) {
    return `${normalizeGeminiBaseUrl(baseUrl)}/models`;
}

export function normalizeGeminiStatusBaseUrl(baseUrl) {
    return normalizeGeminiBaseUrl(baseUrl).replace(/\/v\d(?:alpha|beta)?$/i, '');
}
