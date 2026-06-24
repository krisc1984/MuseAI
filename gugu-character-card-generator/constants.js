export const MODULE_NAME = 'gugu_character_card_generator';
export const MODULE_FOLDER = 'third-party/gugu-character-card-generator';
export const UI_TITLE = '咕咕助手 - 角色卡生成器';
export const STORAGE_NAME = 'GuguCharacterCardGenerator';
export const STORAGE_KEY = 'private-api-keys';
export const DEFAULT_API_FORMAT = 'openai';
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_DEPTH_PROMPT_DEPTH = 4;
export const DEFAULT_DEPTH_PROMPT_ROLE = 'system';
export const DEFAULT_TALKATIVENESS = 0.5;
export const TAB_CHARACTER = 'character';
export const TAB_WORLDBOOK = 'worldbook';
export const TAB_USER = 'user';
export const DEFAULT_GENERATION_TAB = TAB_CHARACTER;

export const DEFAULT_SETTINGS = Object.freeze({
    selectedProfileId: '',
    streamEnabled: true,
    profiles: [],
    draft: {
        activeTab: DEFAULT_GENERATION_TAB,
        name: '',
        concept: '',
        worldbookPrompt: '',
        userName: '',
        userDescription: '',
    },
});
