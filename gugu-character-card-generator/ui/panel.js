import { copyText } from '../../../../utils.js';
import { DEFAULT_API_FORMAT, DEFAULT_GENERATION_TAB, TAB_CHARACTER, TAB_USER, TAB_WORLDBOOK } from '../constants.js';
import { getDefaultBaseUrl } from '../generation/profile-endpoints.js';
import { showAboutPopup } from './about-popup.js';

const TAB_LABELS = Object.freeze({
    [TAB_CHARACTER]: '生成角色卡',
    [TAB_WORLDBOOK]: '生成世界书',
    [TAB_USER]: '生成用户设定',
});

function createProfileOption(profile, selectedId) {
    return $('<option></option>').val(profile.id).text(profile.name).prop('selected', profile.id === selectedId);
}

function findSelectedProfile(settings) {
    return settings.profiles.find(profile => profile.id === settings.selectedProfileId) || null;
}

function formatDebugText(payload) {
    return payload ? JSON.stringify(payload, null, 2) : '';
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function getWorldbookSummary(character) {
    if (!character?.worldbook?.name) {
        return '未绑定世界书';
    }

    return `已有 ${character.worldbook.entryCount} 条世界书`;
}

function getPersonaSummary(character) {
    return character?.persona?.exists ? '已有绑定用户设定' : '未绑定用户设定';
}

function getPersonaName(character) {
    if (!character?.persona?.exists) {
        return '未绑定';
    }

    if ((character.persona.count || 0) > 1) {
        return `${character.persona.name} 等 ${character.persona.count} 个`;
    }

    return character.persona.name || '已绑定';
}

export function createPanel({
    getSettings,
    onSettingsChange,
    onTabChange,
    onGenerate,
    onSaveProfile,
    onDeleteProfile,
    onSelectProfile,
    onFetchModels,
    onOpenCharacter,
    onOpenWorldbook,
    onOpenPersona,
}) {
    let root = null;
    let waitingTimer = null;
    let debugRequest = '';
    let debugResponse = '';
    let activeCharacter = null;
    let cancelAction = null;

    function updateGenerateButton() {
        const button = root.find('#gcg_generate');
        const busy = root.attr('data-gcg-busy') === 'true';
        const label = cancelAction ? '取消生成' : TAB_LABELS[getActiveTab()] || TAB_LABELS[TAB_CHARACTER];
        button.text(label).prop('disabled', busy && !cancelAction);
    }

    function getActiveTab() {
        return String(root.find('.gcg-tab-button.is-active').attr('data-gcg-tab') || DEFAULT_GENERATION_TAB).trim();
    }

    function getDraftInput() {
        return {
            activeTab: getActiveTab(),
            name: String(root.find('#gcg_name').val() || '').trim(),
            concept: String(root.find('#gcg_concept').val() || '').trim(),
            worldbookPrompt: String(root.find('#gcg_worldbook_prompt').val() || '').trim(),
            userName: String(root.find('#gcg_user_name').val() || '').trim(),
            userDescription: String(root.find('#gcg_user_description').val() || '').trim(),
        };
    }

    function getProfileForm() {
        return {
            id: String(root.find('#gcg_private_profile_select').val() || '').trim(),
            name: String(root.find('#gcg_profile_name').val() || '').trim(),
            apiFormat: String(root.find('#gcg_profile_api_format').val() || DEFAULT_API_FORMAT).trim(),
            baseUrl: String(root.find('#gcg_profile_base_url').val() || '').trim(),
            model: String(root.find('#gcg_profile_model').val() || '').trim(),
            apiKey: String(root.find('#gcg_profile_api_key').val() || '').trim(),
        };
    }

    function renderProfileList() {
        const select = root.find('#gcg_private_profile_select');
        select.empty().append('<option value="">未选择</option>');
        getSettings().profiles.forEach(profile => select.append(createProfileOption(profile, getSettings().selectedProfileId)));
    }

    function renderRequestOptions() {
        root.find('#gcg_stream_enabled').prop('checked', getSettings().streamEnabled !== false);
    }

    function renderModelOptions(models = []) {
        const select = root.find('#gcg_profile_model_list');
        select.empty().append('<option value="">选择已拉取的模型</option>');
        models.forEach(model => select.append($('<option></option>').val(model).text(model)));
        select.toggleClass('is-hidden', models.length === 0);
    }

    function renderProfileMeta(apiFormat, keepValue = true) {
        const isGemini = apiFormat === 'gemini';
        const baseUrlInput = root.find('#gcg_profile_base_url');
        const currentValue = String(baseUrlInput.val() || '').trim();
        const defaultValue = getDefaultBaseUrl(apiFormat);

        baseUrlInput.attr('placeholder', defaultValue || 'https://example.com/v1');
        root.find('#gcg_profile_api_key').attr('placeholder', isGemini ? 'AIza...' : 'sk-...');
        root.find('#gcg_profile_base_url_reset').toggleClass('is-hidden', !isGemini);

        if (isGemini && !keepValue && !currentValue) {
            baseUrlInput.val(defaultValue);
        }
    }

    function renderSelectedProfile(profile) {
        const nextProfile = profile || { apiFormat: DEFAULT_API_FORMAT };
        root.find('#gcg_profile_name').val(nextProfile.name || '');
        root.find('#gcg_profile_api_format').val(nextProfile.apiFormat || DEFAULT_API_FORMAT);
        root.find('#gcg_profile_base_url').val(nextProfile.baseUrl || '');
        root.find('#gcg_profile_model').val(nextProfile.model || '');
        root.find('#gcg_profile_model').attr('placeholder', 'gemini-3.1-pro-preview');
        root.find('#gcg_profile_api_key').val(nextProfile.apiKey || '');
        renderModelOptions();
        renderProfileMeta(nextProfile.apiFormat || DEFAULT_API_FORMAT, true);
    }

    function renderDraft() {
        const draft = getSettings().draft;
        root.find('#gcg_name').val(draft.name);
        root.find('#gcg_concept').val(draft.concept);
        root.find('#gcg_worldbook_prompt').val(draft.worldbookPrompt || '');
        root.find('#gcg_user_name').val(draft.userName);
        root.find('#gcg_user_description').val(draft.userDescription);
    }

    function renderTabs() {
        const draft = getSettings().draft;
        const activeTab = [TAB_CHARACTER, TAB_WORLDBOOK, TAB_USER].includes(draft.activeTab) ? draft.activeTab : DEFAULT_GENERATION_TAB;
        root.find('.gcg-tab-button').each(function () {
            const button = $(this);
            const isActive = button.attr('data-gcg-tab') === activeTab;
            button
                .toggleClass('is-active', isActive)
                .attr('aria-selected', String(isActive))
                .attr('tabindex', isActive ? '0' : '-1');
        });
        root.find('[data-gcg-panel]').each(function () {
            const panel = $(this);
            const isActive = panel.attr('data-gcg-panel') === activeTab;
            panel
                .toggleClass('is-hidden', !isActive)
                .prop('hidden', !isActive)
                .attr('aria-hidden', String(!isActive))
                .attr('tabindex', isActive ? '0' : '-1')
                .css('display', isActive ? 'grid' : 'none');
        });
        updateGenerateButton();
    }

    function renderActiveCharacter(character = activeCharacter) {
        const name = String(character?.name || '').trim() || '未选择角色';
        const summary = String(character?.personality || character?.description || '').trim() || '请先在酒馆中选中一个角色。';
        const worldbook = getWorldbookSummary(character);
        const persona = getPersonaSummary(character);
        const canOpenWorldbook = Boolean(character?.worldbook?.exists && character?.worldbook?.name);
        const canOpenPersona = Boolean(character?.persona?.exists && character?.persona?.avatar);

        root.find('[data-gcg-active-name]').text(name);
        root.find('[data-gcg-active-summary]').text(summary);
        root.find('[data-gcg-worldbook-status]').text(worldbook);
        root.find('[data-gcg-worldbook-name]').text(character?.worldbook?.name || '未绑定');
        root.find('[data-gcg-persona-status]').text(persona);
        root.find('[data-gcg-persona-name]').text(getPersonaName(character));
        root.find('[data-gcg-open-character]').prop('disabled', !character);
        root.find('[data-gcg-open-worldbook]').prop('disabled', !canOpenWorldbook);
        root.find('[data-gcg-open-persona]').prop('disabled', !canOpenPersona);
    }

    function updateDebugStatus() {
        const status = !debugRequest && !debugResponse ? '暂无调试数据' : debugRequest && debugResponse ? '已记录请求与回应' : debugRequest ? '已记录请求' : '已记录回应';
        root.find('#gcg_debug_status').text(status);
        root.find('#gcg_debug_toggle_status').text(status);
        root.find('#gcg_copy_debug_request').prop('disabled', !debugRequest);
        root.find('#gcg_copy_debug_response').prop('disabled', !debugResponse);
    }

    function setDebugExpanded(isExpanded) {
        root.find('#gcg_debug_toggle').attr('aria-expanded', String(isExpanded));
        root.find('#gcg_debug_panel')
            .toggleClass('is-hidden', !isExpanded)
            .prop('hidden', !isExpanded)
            .attr('aria-hidden', String(!isExpanded))
            .css('display', isExpanded ? 'grid' : 'none');
    }

    function startWaitingTimer() {
        const startedAt = Date.now();
        clearInterval(waitingTimer);
        root.find('#gcg_status_timer').text('00:00');
        waitingTimer = window.setInterval(() => {
            root.find('#gcg_status_timer').text(formatDuration(Date.now() - startedAt));
        }, 1000);
    }

    function stopWaitingTimer() {
        clearInterval(waitingTimer);
        waitingTimer = null;
        root.find('#gcg_status_timer').text('00:00');
    }

    async function copyDebugPayload(payload, emptyMessage) {
        if (!payload) {
            window.toastr?.info?.(emptyMessage);
            return;
        }
        await copyText(payload);
        window.toastr?.success?.('已复制');
    }

    async function runAction(action) {
        try {
            await action();
        } catch (error) {
            window.toastr?.error?.(error.message || '操作失败');
        }
    }

    function bindDraftEvents() {
        root.find('#gcg_name, #gcg_concept, #gcg_worldbook_prompt, #gcg_user_name, #gcg_user_description').on('input', () => onSettingsChange({ draft: getDraftInput() }));
        root.find('.gcg-tab-button').on('click', async function () {
            const activeTab = String($(this).attr('data-gcg-tab') || DEFAULT_GENERATION_TAB).trim();
            onSettingsChange({ draft: { ...getDraftInput(), activeTab } });
            renderTabs();
            if (typeof onTabChange === 'function') {
                await onTabChange(activeTab);
            } else {
                renderActiveCharacter();
            }
        });
    }

    function bindProfileEvents() {
        root.find('#gcg_private_profile_select').on('change', async function () {
            await onSelectProfile(String($(this).val() || '').trim());
        });

        root.find('#gcg_profile_api_format').on('change', function () {
            renderModelOptions();
            renderProfileMeta(String($(this).val() || DEFAULT_API_FORMAT), false);
        });

        root.find('#gcg_profile_model_list').on('change', function () {
            const value = String($(this).val() || '').trim();
            if (value) {
                root.find('#gcg_profile_model').val(value);
            }
        });

        root.find('#gcg_profile_base_url_reset').on('click', function () {
            root.find('#gcg_profile_base_url').val(getDefaultBaseUrl('gemini'));
        });

        root.find('#gcg_profile_new').on('click', function () {
            root.find('#gcg_private_profile_select').val('');
            renderSelectedProfile(null);
        });

        root.find('#gcg_profile_save').on('click', async function () {
            await onSaveProfile(getProfileForm());
        });

        root.find('#gcg_profile_delete').on('click', async function () {
            const profileId = String(root.find('#gcg_private_profile_select').val() || '').trim();
            if (profileId) {
                await onDeleteProfile(profileId);
            }
        });

        root.find('#gcg_profile_fetch_models').on('click', async function () {
            await onFetchModels(getProfileForm());
        });

        root.find('#gcg_stream_enabled').on('change', function () {
            onSettingsChange({ streamEnabled: $(this).prop('checked') });
        });
    }

    function bindActionEvents() {
        root.find('#gcg_generate').on('click', async () => {
            if (cancelAction) {
                await runAction(cancelAction);
                return;
            }

            await onGenerate({ profile: getProfileForm(), draft: getDraftInput() });
        });
        root.find('#gcg_about').on('click', async () => showAboutPopup());
        root.find('#gcg_copy_debug_request').on('click', async () => copyDebugPayload(debugRequest, '暂无原始请求'));
        root.find('#gcg_copy_debug_response').on('click', async () => copyDebugPayload(debugResponse, '暂无原始回应'));
        root.find('#gcg_debug_toggle').on('click', function () {
            setDebugExpanded($(this).attr('aria-expanded') !== 'true');
        });
        root.find('[data-gcg-open-character]').on('click', async () => await runAction(onOpenCharacter));
        root.find('[data-gcg-open-worldbook]').on('click', async () => await runAction(onOpenWorldbook));
        root.find('[data-gcg-open-persona]').on('click', async () => await runAction(onOpenPersona));
    }

    return {
        mount(html, initialState = {}) {
            root = $(html);
            renderProfileList();
            renderRequestOptions();
            activeCharacter = initialState.character || null;
            renderSelectedProfile(initialState.profile || findSelectedProfile(getSettings()));
            renderDraft();
            renderTabs();
            renderActiveCharacter(activeCharacter);
            setDebugExpanded(false);
            updateDebugStatus();
            root.attr('data-gcg-busy', 'false');
            bindDraftEvents();
            bindProfileEvents();
            bindActionEvents();
            updateGenerateButton();
        },
        root() { return root; },
        refresh(profile = undefined, character = null) {
            activeCharacter = character;
            renderProfileList();
            renderRequestOptions();
            renderSelectedProfile(profile === undefined ? findSelectedProfile(getSettings()) : profile);
            renderDraft();
            renderTabs();
            renderActiveCharacter(character);
        },
        focus() {
            renderActiveCharacter();
            root.get(0)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        clearModelOptions() { renderModelOptions(); },
        setModelOptions(models) { renderModelOptions(models); },
        setModelsBusy(isBusy) {
            root.find('#gcg_profile_fetch_models').prop('disabled', isBusy);
            root.find('#gcg_profile_fetch_models').text(isBusy ? '拉取中' : '拉取');
        },
        setBusy(isBusy) {
            root.attr('data-gcg-busy', String(Boolean(isBusy)));
            updateGenerateButton();
        },
        setCancelable(action = null) {
            cancelAction = typeof action === 'function' ? action : null;
            updateGenerateButton();
        },
        setWaiting(isWaiting) {
            root.find('#gcg_status').toggleClass('is-waiting', isWaiting);
            isWaiting ? startWaitingTimer() : stopWaitingTimer();
        },
        setStatus(message, isError = false) {
            root.find('#gcg_status').toggleClass('is-error', isError);
            root.find('#gcg_status_text').text(message || '');
        },
        clearDebugState() {
            debugRequest = '';
            debugResponse = '';
            updateDebugStatus();
        },
        setDebugRequest(payload) {
            debugRequest = formatDebugText(payload);
            setDebugExpanded(Boolean(debugRequest));
            updateDebugStatus();
        },
        setDebugResponse(payload) {
            debugResponse = formatDebugText(payload);
            setDebugExpanded(Boolean(debugRequest || debugResponse));
            updateDebugStatus();
        },
    };
}
