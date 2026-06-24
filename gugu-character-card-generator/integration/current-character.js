import { getConnectedPersonas } from '../../../../personas.js';
import { power_user } from '../../../../power-user.js';

function toText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function toStringArray(value) {
    return Array.isArray(value)
        ? value.map(item => toText(item)).filter(Boolean)
        : [];
}

export function getActiveCharacter(context) {
    const characterId = Number(context.characterId);
    const character = context.characters?.[characterId];
    if (!character) {
        return null;
    }

    const data = character.data || {};
    return {
        id: characterId,
        avatar: toText(character.avatar),
        name: toText(character.name || data.name),
        personality: toText(character.personality || data.personality),
        description: toText(character.description || data.description),
        firstMessage: toText(character.first_mes || data.first_mes),
        mesExample: toText(character.mes_example || data.mes_example),
        creatorNotes: toText(data.creator_notes || character.creatorcomment),
        alternateGreetings: toStringArray(data.alternate_greetings),
        worldName: toText(data.extensions?.world),
    };
}

function countWorldbookEntries(data) {
    const entries = data?.entries;
    return entries && typeof entries === 'object'
        ? Object.keys(entries).length
        : 0;
}

async function getWorldbookMeta(context, worldName) {
    const trimmedName = toText(worldName);
    if (!trimmedName) {
        return {
            name: '',
            exists: false,
            entryCount: 0,
        };
    }

    try {
        const data = await context.loadWorldInfo(trimmedName);
        return {
            name: trimmedName,
            exists: Boolean(data && typeof data === 'object'),
            entryCount: countWorldbookEntries(data),
        };
    } catch {
        return {
            name: trimmedName,
            exists: false,
            entryCount: 0,
        };
    }
}

function getPersonaMeta(characterAvatar) {
    const avatar = toText(characterAvatar);
    if (!avatar) {
        return {
            avatar: '',
            name: '',
            exists: false,
            count: 0,
        };
    }

    const connectedAvatars = getConnectedPersonas(avatar);
    const names = connectedAvatars
        .map(personaAvatar => toText(power_user.personas?.[personaAvatar]))
        .filter(Boolean);

    return {
        avatar: connectedAvatars[0] || '',
        name: names[0] || '',
        exists: connectedAvatars.length > 0,
        count: connectedAvatars.length,
    };
}

export async function getActiveCharacterState(context) {
    const character = getActiveCharacter(context);
    if (!character) {
        return null;
    }

    return {
        ...character,
        worldbook: await getWorldbookMeta(context, character.worldName),
        persona: getPersonaMeta(character.avatar),
    };
}
