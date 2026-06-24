import { localforage } from '../../../../lib.js';
import { getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import {
    DEFAULT_API_FORMAT,
    DEFAULT_GENERATION_TAB,
    DEFAULT_SETTINGS,
    MODULE_FOLDER,
    MODULE_NAME,
    TAB_CHARACTER,
    TAB_USER,
    TAB_WORLDBOOK,
} from './constants.js';
import { fetchProfileModels } from './generation/model-fetcher.js';
import { buildGenerationRequest, generateWithPrivateApi } from './generation/private-api.js';
import { parseCharacterCardResult, parseUserPersonaResult, parseWorldBookResult } from './generation/response-parser.js';
import { createCharacterFromResult } from './integration/character.js';
import { getActiveCharacter, getActiveCharacterState } from './integration/current-character.js';
import { bindPersonaToCharacter, ensurePersona, openPersonaManager, resolveUserContext, updatePersonaDefinition } from './integration/persona.js';
import { bindWorldbookToCharacter, saveGeneratedWorldbook } from './integration/worldbook.js';
import { createProfileStore } from './storage/profile-store.js';
import { createPanel } from './ui/panel.js';
import { openWorldInfoEditor } from '../../../world-info.js';

const profileStore = createProfileStore(localforage);

function cloneDefaults(value) {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function normalizeStoredProfile(profile) {
    return {
        id: String(profile?.id || Date.now()),
        name: String(profile?.name || '').trim(),
        apiFormat: profile?.apiFormat === 'gemini' ? 'gemini' : DEFAULT_API_FORMAT,
        baseUrl: String(profile?.baseUrl || '').trim(),
        model: String(profile?.model || '').trim(),
    };
}

function normalizeDraft(draft) {
    return {
        ...cloneDefaults(DEFAULT_SETTINGS.draft),
        ...(draft && typeof draft === 'object' ? draft : {}),
        activeTab: [TAB_CHARACTER, TAB_WORLDBOOK, TAB_USER].includes(draft?.activeTab) ? draft.activeTab : DEFAULT_GENERATION_TAB,
    };
}

function getSettings() {
    const context = getContext();
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = cloneDefaults(DEFAULT_SETTINGS);
    }

    Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (!Object.hasOwn(context.extensionSettings[MODULE_NAME], key)) {
            context.extensionSettings[MODULE_NAME][key] = cloneDefaults(DEFAULT_SETTINGS[key]);
        }
    });

    context.extensionSettings[MODULE_NAME].profiles = Array.isArray(context.extensionSettings[MODULE_NAME].profiles)
        ? context.extensionSettings[MODULE_NAME].profiles.map(normalizeStoredProfile)
        : [];
    context.extensionSettings[MODULE_NAME].streamEnabled = context.extensionSettings[MODULE_NAME].streamEnabled !== false;
    context.extensionSettings[MODULE_NAME].draft = normalizeDraft(context.extensionSettings[MODULE_NAME].draft);
    return context.extensionSettings[MODULE_NAME];
}

function saveSettings() {
    getContext().saveSettingsDebounced();
}

function updateSettings(patch) {
    Object.assign(getSettings(), patch);
    saveSettings();
}

function normalizeProfile(profile) {
    return normalizeStoredProfile({
        ...profile,
        id: profile.id || String(Date.now()),
    });
}

async function loadSelectedProfile() {
    const settings = getSettings();
    const profile = settings.profiles.find(item => item.id === settings.selectedProfileId);
    if (!profile) {
        return null;
    }

    return {
        ...profile,
        apiKey: await profileStore.getApiKey(profile.id),
    };
}

async function refreshPanel(panel, profile = undefined) {
    const context = getContext();
    const nextProfile = profile === undefined ? await loadSelectedProfile() : profile;
    const activeCharacter = await getActiveCharacterState(context);
    panel.refresh(nextProfile, activeCharacter);
}

async function saveProfile(form) {
    const settings = getSettings();
    const profile = normalizeProfile(form);
    if (!profile.name || !profile.baseUrl || !profile.model) {
        throw new Error('私有 API 配置至少需要名称、格式、Base URL 和模型');
    }

    settings.profiles = settings.profiles.filter(item => item.id !== profile.id).concat(profile)
        .sort((left, right) => left.name.localeCompare(right.name));
    settings.selectedProfileId = profile.id;
    await profileStore.saveApiKey(profile.id, form.apiKey || '');
    saveSettings();

    return {
        ...profile,
        apiKey: await profileStore.getApiKey(profile.id),
    };
}

async function deleteProfile(profileId) {
    const settings = getSettings();
    settings.profiles = settings.profiles.filter(item => item.id !== profileId);
    settings.selectedProfileId = '';
    await profileStore.deleteApiKey(profileId);
    saveSettings();
}

function installMenuEntry(panel) {
    const menu = $('#extensionsMenu');
    if (!menu.length || $('#gcg_menu_entry').length) {
        return;
    }

    const entry = $(`
        <div id="gcg_menu_entry" class="extension_container">
            <div class="list-group-item flex-container interactable">
                <div class="fa-solid fa-id-card extensionsMenuExtensionButton"></div>
                <span>角色卡生成器</span>
            </div>
        </div>
    `);
    entry.on('click', () => {
        panel.focus();
        menu.hide();
    });
    menu.append(entry);
}

function buildCharacterModeInput(draft) {
    if (!draft.concept) {
        throw new Error('至少要填写“角色简介”');
    }

    return {
        name: draft.name,
        concept: draft.concept,
    };
}

function buildWorldbookModeInput(character, draft) {
    if (!character) {
        throw new Error('请先在酒馆中选中一个角色');
    }

    return {
        characterName: character.name,
        characterPersonality: character.personality,
        characterDescription: character.description,
        firstMessage: character.firstMessage,
        creatorNotes: character.creatorNotes,
        worldName: character.worldName,
        worldbookPrompt: draft.worldbookPrompt,
    };
}

function buildUserModeInput(character, userContext) {
    if (!character) {
        throw new Error('请先在酒馆中选中一个角色');
    }

    return {
        characterName: character.name,
        characterPersonality: character.personality,
        characterDescription: character.description,
        firstMessage: character.firstMessage,
        userName: userContext.name,
        userDescription: userContext.description,
    };
}

function createCancelError() {
    const error = new Error('已取消生成');
    error.name = 'AbortError';
    return error;
}

function runGeneration(profile, input, mode, options = {}) {
    console.time('[GCG] generation request');
    const requestSnapshot = buildGenerationRequest(profile, input, mode, options);
    return {
        requestSnapshot,
        promise: generateWithPrivateApi(requestSnapshot, profile.apiKey, options).finally(() => {
            console.timeEnd('[GCG] generation request');
        }),
    };
}

async function executeGeneration(panel, profile, input, mode, options = {}) {
    const { requestSnapshot, promise } = runGeneration(profile, input, mode, options);
    panel.setDebugRequest(requestSnapshot);
    panel.setStatus(requestSnapshot.stream ? '正在流式接收模型输出...' : '正在等待模型返回...');
    panel.setWaiting(true);
    const result = await promise;
    panel.setWaiting(false);
    panel.setDebugResponse(result.debugResponse);
    return result.content;
}

async function openActiveCharacterEditor(context, characterId) {
    await context.selectCharacterById(characterId);
}

async function handleCharacterGeneration(panel, profile, draft) {
    const context = getContext();
    const streamEnabled = getSettings().streamEnabled !== false;
    const controller = new AbortController();
    panel.setCancelable(() => {
        panel.setStatus('正在取消生成...');
        controller.abort();
    });
    const content = await executeGeneration(panel, profile, buildCharacterModeInput(draft), TAB_CHARACTER, {
        stream: streamEnabled,
        signal: controller.signal,
    });
    panel.setCancelable(null);
    panel.setStatus('模型已返回，正在解析角色卡...');
    const parsed = parseCharacterCardResult(content, draft);
    panel.setStatus('解析完成，正在创建角色...');
    const characterResult = await createCharacterFromResult(context, parsed);
    await openActiveCharacterEditor(context, characterResult.characterId);
    await refreshPanel(panel);
    panel.setStatus(`完成：已创建角色「${parsed.name}」`);
    window.toastr?.success?.(`已创建角色「${parsed.name}」`);
}

async function handleWorldbookGeneration(panel, profile, draft) {
    const context = getContext();
    const activeCharacter = getActiveCharacter(context);
    const input = buildWorldbookModeInput(activeCharacter, draft);
    const content = await executeGeneration(panel, profile, input, TAB_WORLDBOOK, {
        stream: getSettings().streamEnabled !== false,
    });
    panel.setStatus('模型已返回，正在解析世界书...');
    const entries = parseWorldBookResult(content);
    panel.setStatus('解析完成，正在写入世界书...');
    const worldName = await saveGeneratedWorldbook(context, activeCharacter.name, entries, activeCharacter.worldName);
    await bindWorldbookToCharacter(context, activeCharacter.id, worldName);
    openWorldInfoEditor(worldName);
    await refreshPanel(panel);
    panel.setStatus(`完成：已为「${activeCharacter.name}」写入世界书`);
    window.toastr?.success?.(`已写入世界书「${worldName}」`);
}

async function handleUserGeneration(panel, profile, draft) {
    const context = getContext();
    const activeCharacter = getActiveCharacter(context);
    const userContext = resolveUserContext(draft, context.powerUserSettings);
    const content = await executeGeneration(panel, profile, buildUserModeInput(activeCharacter, userContext), TAB_USER, {
        stream: getSettings().streamEnabled !== false,
    });
    panel.setStatus('模型已返回，正在解析用户设定...');
    const userPersona = parseUserPersonaResult(content);
    const persona = await ensurePersona(context, userContext);
    panel.setStatus('解析完成，正在写入用户设定...');
    await updatePersonaDefinition(persona, userPersona);
    panel.setStatus('正在绑定用户设定到角色...');
    await bindPersonaToCharacter(persona, activeCharacter.name);
    panel.setStatus('正在打开用户设定...');
    await openPersonaManager(persona.avatar);
    await refreshPanel(panel);
    panel.setStatus(`完成：已为「${activeCharacter.name}」绑定用户「${persona.name}」`);
    window.toastr?.success?.(`已写入用户设定「${persona.name}」`);
}

async function resolveProfileWithKey(profile) {
    return {
        ...profile,
        apiKey: profile.apiKey || await profileStore.getApiKey(profile.id),
    };
}

async function init() {
    const html = await renderExtensionTemplateAsync(MODULE_FOLDER, 'settings');
    const initialProfile = await loadSelectedProfile();
    const initialCharacter = await getActiveCharacterState(getContext());
    const panel = createPanel({
        getSettings,
        onSettingsChange: patch => updateSettings(patch),
        onTabChange: async () => {
            await refreshPanel(panel);
        },
        onSelectProfile: async profileId => {
            updateSettings({ selectedProfileId: profileId });
            await refreshPanel(panel);
        },
        onSaveProfile: async form => {
            const profile = await saveProfile(form);
            await refreshPanel(panel, profile);
            window.toastr?.success?.('私有 API 已保存');
        },
        onDeleteProfile: async profileId => {
            await deleteProfile(profileId);
            await refreshPanel(panel, null);
            window.toastr?.success?.('私有 API 已删除');
        },
        onFetchModels: async profile => {
            panel.setModelsBusy(true);
            panel.clearModelOptions();
            try {
                const models = await fetchProfileModels(profile);
                panel.setModelOptions(models);
                window.toastr?.[models.length ? 'success' : 'info']?.(models.length ? `已拉取 ${models.length} 个模型` : '未拉取到可用模型');
            } catch (error) {
                console.error('[GCG] model fetch failed', error);
                window.toastr?.error?.(error.message || '拉取模型失败');
            } finally {
                panel.setModelsBusy(false);
            }
        },
        onOpenCharacter: async () => {
            const context = getContext();
            const activeCharacter = getActiveCharacter(context);
            if (!activeCharacter) {
                throw new Error('请先在酒馆中选中一个角色');
            }
            await openActiveCharacterEditor(context, activeCharacter.id);
            await refreshPanel(panel);
        },
        onOpenWorldbook: async () => {
            const activeCharacter = getActiveCharacter(getContext());
            const worldName = String(activeCharacter?.worldName || '').trim();
            if (!worldName) {
                throw new Error('当前角色还没有绑定世界书');
            }
            openWorldInfoEditor(worldName);
            await refreshPanel(panel);
        },
        onOpenPersona: async () => {
            const activeCharacter = await getActiveCharacterState(getContext());
            const personaAvatar = String(activeCharacter?.persona?.avatar || '').trim();
            if (!personaAvatar) {
                throw new Error('当前角色还没有绑定用户设定');
            }
            await openPersonaManager(personaAvatar);
            await refreshPanel(panel);
        },
        onGenerate: async ({ profile, draft }) => {
            panel.setBusy(true);
            panel.setCancelable(null);
            panel.clearDebugState();
            panel.setStatus('正在整理输入并准备请求...');

            try {
                const finalProfile = await resolveProfileWithKey(profile);
                if (draft.activeTab === TAB_WORLDBOOK) {
                    await handleWorldbookGeneration(panel, finalProfile, draft);
                } else if (draft.activeTab === TAB_USER) {
                    await handleUserGeneration(panel, finalProfile, draft);
                } else {
                    await handleCharacterGeneration(panel, finalProfile, draft);
                }
            } catch (error) {
                console.error('[GCG] generation failed', error);
                const isAbortError = error?.name === 'AbortError';
                const errorMessage = isAbortError ? '已取消生成' : error.message || '生成失败';
                if (error.debugRequest) {
                    panel.setDebugRequest(error.debugRequest);
                }
                if (error.debugResponse) {
                    panel.setDebugResponse(error.debugResponse);
                }
                panel.setStatus(errorMessage, !isAbortError);
                window.toastr?.[isAbortError ? 'info' : 'error']?.(errorMessage);
            } finally {
                panel.setCancelable(null);
                panel.setWaiting(false);
                panel.setBusy(false);
            }
        },
    });

    panel.mount(html, { profile: initialProfile, character: initialCharacter });
    $('#extensions_settings2').append(panel.root());
    installMenuEntry(panel);

    const context = getContext();
    const refresh = async () => await refreshPanel(panel);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, refresh);
    context.eventSource.on(context.eventTypes.CHARACTER_EDITOR_OPENED, refresh);
    context.eventSource.on(context.eventTypes.CHARACTER_EDITED, refresh);
    context.eventSource.on(context.eventTypes.WORLDINFO_UPDATED, refresh);
}

void init();
