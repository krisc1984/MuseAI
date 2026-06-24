function toText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function stripCodeFence(raw) {
    const text = String(raw || '').trim();
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    return match ? match[1].trim() : text;
}

function extractFirstJsonObject(raw) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < raw.length; index += 1) {
        const char = raw[index];
        if (start < 0) {
            if (char === '{') {
                start = index;
                depth = 1;
            }
            continue;
        }

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth === 0) {
            return raw.slice(start, index + 1);
        }
    }

    return null;
}

function repairJson(text) {
    return String(text || '')
        .replace(/"(?:[^"\\]|\\.)*"/g, match => match.replace(/[\x00-\x1f]/g, char => {
            if (char === '\n') return '\\n';
            if (char === '\r') return '\\r';
            if (char === '\t') return '\\t';
            return '';
        }))
        .replace(/,\s*([}\]])/g, '$1');
}

function parseJsonCandidates(text) {
    const cleaned = stripCodeFence(text);
    const extracted = extractFirstJsonObject(cleaned);
    const candidates = extracted
        ? [extracted, cleaned, repairJson(extracted), repairJson(cleaned)]
        : [cleaned, repairJson(cleaned)];

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            // Continue trying parse candidates.
        }
    }

    throw new Error('模型返回无法解析为 JSON');
}

function hasOwnField(value, fieldName) {
    if (!Object.hasOwn(value, fieldName)) {
        throw new Error(`模型返回缺少必填字段：${fieldName}`);
    }
}

function requireText(value, fieldName) {
    const text = toText(value);
    if (!text) {
        throw new Error(`模型返回缺少必填字段：${fieldName}`);
    }
    return text;
}

function requireArray(value, fieldName) {
    if (!Array.isArray(value)) {
        throw new Error(`模型返回字段格式错误：${fieldName} 必须是数组`);
    }
    return value;
}

function splitStringList(value) {
    const text = toText(value);
    if (!text) {
        return [];
    }

    if (text.includes('<START>')) {
        return text
            .split(/<START>/i)
            .map(item => item.trim())
            .filter(Boolean)
            .map(item => `<START>\n${item.replace(/^<START>\s*/i, '')}`);
    }

    return [text];
}

function normalizeStringArray(value, fieldName) {
    const items = Array.isArray(value)
        ? requireArray(value, fieldName).map(item => toText(item)).filter(Boolean)
        : splitStringList(value);
    return items;
}

function requireBoolean(value, fieldName) {
    if (typeof value !== 'boolean') {
        throw new Error(`模型返回字段格式错误：${fieldName} 必须是布尔值`);
    }
    return value;
}

function normalizeWorldEntry(entry, index) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`世界书第 ${index + 1} 条格式错误`);
    }

    return {
        comment: requireText(entry.comment, `world_book_entries[${index}].comment`),
        keys: normalizeStringArray(entry.keys, `world_book_entries[${index}].keys`),
        secondary_keys: normalizeStringArray(entry.secondary_keys ?? [], `world_book_entries[${index}].secondary_keys`),
        constant: requireBoolean(entry.constant, `world_book_entries[${index}].constant`),
        content: requireText(entry.content, `world_book_entries[${index}].content`),
    };
}

export function parseCharacterCardResult(rawText, input) {
    const parsed = parseJsonCandidates(rawText);
    hasOwnField(parsed, 'greetings');
    hasOwnField(parsed, 'mes_example');
    const name = toText(input.name) || requireText(parsed.name, 'name');
    const greetings = normalizeStringArray(parsed.greetings, 'greetings');
    const exampleMessages = normalizeStringArray(parsed.mes_example, 'mes_example');
    return {
        name,
        personality: requireText(parsed.personality, 'personality'),
        description: requireText(parsed.description, 'description'),
        creatorNotes: toText(parsed.creator_notes),
        greetings,
        firstMessage: greetings[0] || '',
        exampleMessages,
        alternateGreetings: greetings.slice(1, 5),
    };
}

export function parseWorldBookResult(rawText) {
    const parsed = parseJsonCandidates(rawText);
    const entries = requireArray(parsed.world_book_entries, 'world_book_entries');
    return entries.map((entry, index) => normalizeWorldEntry(entry, index));
}

export function parseUserPersonaResult(rawText) {
    const parsed = parseJsonCandidates(rawText);
    return requireText(parsed.user_persona, 'user_persona');
}
