import { DEFAULT_TALKATIVENESS, UI_TITLE } from '../constants.js';

const DEFAULT_USER_LABELS = Object.freeze(['{{user}}', '[用户]', '用户', '[User]', 'User', '[user]', 'user']);
const DEFAULT_CHAR_LABELS = Object.freeze(['{{char}}', '[角色]', '角色', '[Character]', 'Character', '[character]', 'character', '[Char]', 'Char', '[char]', 'char']);

function toText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function appendArray(formData, key, values) {
    values.forEach(value => formData.append(key, value));
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniq(items) {
    return [...new Set(items.map(item => toText(item)).filter(Boolean))];
}

function buildLabelPattern(labels) {
    const escapedLabels = uniq(labels).sort((left, right) => right.length - left.length).map(escapeRegExp);
    return new RegExp(`(${escapedLabels.join('|')})\\s*[：:]`, 'g');
}

function getSpeakerLabels(characterName, userName) {
    const charLabels = uniq([...DEFAULT_CHAR_LABELS, characterName, characterName && `[${characterName}]`]);
    const userLabels = uniq([...DEFAULT_USER_LABELS, userName, userName && `[${userName}]`]);
    return {
        charLabels,
        userLabels,
        charSet: new Set(charLabels.map(item => item.toLowerCase())),
        userSet: new Set(userLabels.map(item => item.toLowerCase())),
    };
}

function collectMatches(text, labels) {
    const pattern = buildLabelPattern([...labels.charLabels, ...labels.userLabels]);
    return [...text.matchAll(pattern)].filter(match => {
        const index = Number(match.index || 0);
        return index === 0 || /\s/.test(text[index - 1]);
    });
}

function getNormalizedSpeaker(label, labels) {
    const normalized = toText(label).toLowerCase();
    if (labels.userSet.has(normalized)) {
        return '{{user}}:';
    }
    if (labels.charSet.has(normalized)) {
        return '{{char}}:';
    }
    return '';
}

function createSegmentsFromMatches(source, matches, labels) {
    const segments = [];
    for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        const speaker = getNormalizedSpeaker(match[1], labels);
        const start = Number(match.index || 0) + match[0].length;
        const end = index + 1 < matches.length ? Number(matches[index + 1].index || source.length) : source.length;
        const content = source.slice(start, end).trim();
        if (!speaker || !content) {
            continue;
        }
        const previous = segments.length ? segments[segments.length - 1] : null;
        if (previous?.speaker === speaker) {
            previous.content = `${previous.content}\n${content}`;
            continue;
        }
        segments.push({ speaker, content });
    }
    return segments;
}

function collectGenericSpeakerMatches(text) {
    const pattern = /(?:^|\n)\s*(\[[^\]\n]{1,32}\]|[^\s：:\[\]\n][^\n：:]{0,30})\s*[：:]/g;
    return [...text.matchAll(pattern)].map(match => ({
        index: Number(match.index || 0) + match[0].lastIndexOf(match[1]),
        label: match[1],
        fullMatch: match[0].slice(match[0].lastIndexOf(match[1])),
    }));
}

function createSegmentsFromGenericMatches(source, matches) {
    return matches.map((match, index) => {
        const start = match.index + match.fullMatch.length;
        const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
        return {
            speaker: match.label,
            content: source.slice(start, end).trim(),
        };
    }).filter(item => item.content);
}

function resolveUnknownSpeakerLabels(segments, labels) {
    const speakers = uniq(segments.map(item => item.speaker));
    const normalizedMap = new Map();

    speakers.forEach(speaker => {
        const normalized = getNormalizedSpeaker(speaker, labels);
        if (normalized) {
            normalizedMap.set(speaker, normalized);
        }
    });

    if (normalizedMap.size === speakers.length) {
        return normalizedMap;
    }

    const remaining = speakers.filter(speaker => !normalizedMap.has(speaker));
    const hasChar = [...normalizedMap.values()].includes('{{char}}:');
    const hasUser = [...normalizedMap.values()].includes('{{user}}:');
    if (remaining.length === 1 && hasChar && !hasUser) {
        normalizedMap.set(remaining[0], '{{user}}:');
        return normalizedMap;
    }

    if (remaining.length === 1 && hasUser && !hasChar) {
        normalizedMap.set(remaining[0], '{{char}}:');
        return normalizedMap;
    }

    return null;
}

function normalizeGenericSegments(segments, labels) {
    const speakerMap = resolveUnknownSpeakerLabels(segments, labels);
    if (!speakerMap) {
        throw new Error('对话示例无法归一化为酒馆格式');
    }

    return segments.reduce((result, segment) => {
        const speaker = speakerMap.get(segment.speaker);
        if (!speaker || !segment.content) {
            return result;
        }

        const previous = result.length ? result[result.length - 1] : null;
        if (previous?.speaker === speaker) {
            previous.content = `${previous.content}\n${segment.content}`;
            return result;
        }

        result.push({ speaker, content: segment.content });
        return result;
    }, []);
}

function ensureDialogueSegments(segments) {
    if (segments.length < 2) {
        throw new Error('对话示例无法归一化为酒馆格式');
    }

    const hasUser = segments.some(item => item.speaker === '{{user}}:');
    const hasChar = segments.some(item => item.speaker === '{{char}}:');
    if (!hasUser || !hasChar) {
        throw new Error('对话示例无法归一化为酒馆格式');
    }
}

function normalizeDialogueExample(value, names) {
    const source = String(value || '').replace(/\r/g, '').replace(/^<START>\s*/i, '').trim();
    const labels = getSpeakerLabels(names.characterName, names.userName);
    const knownMatches = collectMatches(source, labels);
    const knownSegments = createSegmentsFromMatches(source, knownMatches, labels);
    if (knownSegments.length >= 2) {
        ensureDialogueSegments(knownSegments);
        return knownSegments.map(item => `${item.speaker}${item.content}`).join('\n');
    }

    const genericMatches = collectGenericSpeakerMatches(source);
    const genericSegments = normalizeGenericSegments(createSegmentsFromGenericMatches(source, genericMatches), labels);
    ensureDialogueSegments(genericSegments);
    return genericSegments.map(item => `${item.speaker}${item.content}`).join('\n');
}

function buildMesExample(exampleMessages, names) {
    return exampleMessages
        .map(message => normalizeDialogueExample(message, names))
        .map(message => `<START>\n${message}`)
        .join('\n\n');
}

export async function createCharacterFromResult(context, character, worldName = '') {
    const formData = new FormData();
    formData.append('ch_name', character.name);
    formData.append('description', character.description);
    formData.append('personality', toText(character.personality));
    formData.append('scenario', '');
    formData.append('first_mes', character.firstMessage);
    formData.append('mes_example', buildMesExample(character.exampleMessages, {
        characterName: character.name,
        userName: character.userName,
    }));
    formData.append('creator_notes', toText(character.creatorNotes));
    formData.append('creator', UI_TITLE);
    formData.append('character_version', 'v1.0');
    formData.append('tags', '');
    formData.append('world', toText(worldName));
    formData.append('talkativeness', String(DEFAULT_TALKATIVENESS));
    formData.append('extensions', '{}');
    formData.append('fav', 'false');
    appendArray(formData, 'alternate_greetings', character.alternateGreetings);

    const response = await fetch('/api/characters/create', {
        method: 'POST',
        headers: context.getRequestHeaders({ omitContentType: true }),
        body: formData,
        cache: 'no-cache',
    });

    if (!response.ok) {
        throw new Error('创建角色失败');
    }

    const avatar = await response.text();
    await context.getCharacters();
    const characterId = context.characters.findIndex(item => item.avatar === avatar);
    if (characterId === -1) {
        throw new Error('角色创建成功，但未能在列表中定位新角色');
    }

    await context.selectCharacterById(characterId);
    return {
        avatar,
        characterId,
    };
}
