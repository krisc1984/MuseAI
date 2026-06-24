import { default_user_avatar, saveSettingsDebounced } from '../../../../../script.js';
import { getUserAvatars, initPersona, setPersonaDescription, setPersonaLockState, setUserAvatar, user_avatar } from '../../../../personas.js';
import { power_user } from '../../../../power-user.js';

function toText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function toAsciiStem(name) {
    return toText(name).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'persona';
}

function buildAvatarId(name) {
    return `${Date.now()}-${toAsciiStem(name)}.png`;
}

function buildPersonaRecord(avatar, name, description) {
    return {
        avatar,
        name: toText(name),
        description: toText(description),
    };
}

function hasDuplicatePersonaName(powerUserSettings, name) {
    return Object.values(powerUserSettings.personas || {})
        .some(personaName => toText(personaName) === name);
}

export function resolveUserContext(draft, powerUserSettings) {
    const name = toText(draft.userName);
    const description = toText(draft.userDescription);

    if (!name) {
        throw new Error('生成用户设定时必须填写“你是谁”');
    }

    if (!description) {
        throw new Error('生成用户设定时必须填写“用户方向”');
    }

    if (hasDuplicatePersonaName(powerUserSettings, name)) {
        throw new Error('已存在同名用户设定，请更换名字');
    }

    return {
        mode: 'new',
        avatar: '',
        name,
        description,
    };
}

async function uploadPersonaAvatar(context, avatarId) {
    const avatarResponse = await fetch(default_user_avatar);
    if (!avatarResponse.ok) {
        throw new Error('读取默认用户头像失败');
    }

    const avatarBlob = await avatarResponse.blob();
    const avatarFile = new File([avatarBlob], avatarId, { type: avatarBlob.type || 'image/png' });
    const formData = new FormData();
    formData.append('avatar', avatarFile);
    formData.append('overwrite_name', avatarId);

    const uploadResponse = await fetch('/api/avatars/upload', {
        method: 'POST',
        headers: context.getRequestHeaders({ omitContentType: true }),
        body: formData,
        cache: 'no-cache',
    });

    if (!uploadResponse.ok) {
        throw new Error('创建用户设定头像失败');
    }
}

async function createPersona(context, persona) {
    const avatarId = buildAvatarId(persona.name);
    await uploadPersonaAvatar(context, avatarId);
    initPersona(avatarId, persona.name, persona.description, '');
    await getUserAvatars(true, avatarId);
    return {
        ...persona,
        avatar: avatarId,
    };
}

export async function ensurePersona(context, persona) {
    return await createPersona(context, persona);
}

export async function updatePersonaDefinition(persona, description) {
    const avatar = toText(persona.avatar);
    const nextDescription = toText(description);

    if (!avatar) {
        throw new Error('用户设定缺少 avatar，无法写入 AI 生成内容');
    }

    const descriptor = power_user.persona_descriptions?.[avatar];
    if (!descriptor) {
        throw new Error('用户设定缺少描述记录，无法写入 AI 生成内容');
    }

    descriptor.description = nextDescription;

    if (user_avatar === avatar) {
        power_user.persona_description = nextDescription;
        setPersonaDescription();
    }

    saveSettingsDebounced();
    await getUserAvatars(true, avatar);
}

export async function bindPersonaToCharacter(persona, characterName) {
    await setUserAvatar(persona.avatar, { toastPersonaNameChange: false, navigateToCurrent: false });
    await setPersonaLockState(true, 'chat');
    await setPersonaLockState(true, 'character');
    return `${persona.name} -> ${characterName}`;
}

export async function openPersonaManager(personaAvatar = '') {
    const drawer = $('#persona-management-button .drawer-content');
    if (!drawer.hasClass('openDrawer')) {
        $('#persona-management-button .drawer-toggle').trigger('click');
    }

    const avatar = toText(personaAvatar);
    if (avatar) {
        await setUserAvatar(avatar, { toastPersonaNameChange: false, navigateToCurrent: false });
    }
}
