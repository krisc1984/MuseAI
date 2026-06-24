function buildWorldInfoEntry(entry, uid) {
    const secondaryKeys = Array.isArray(entry.secondary_keys) ? entry.secondary_keys : [];
    const isConstant = Boolean(entry.constant);
    return {
        uid,
        key: Array.isArray(entry.keys) ? entry.keys : [],
        keysecondary: secondaryKeys,
        comment: entry.comment || '',
        content: entry.content || '',
        constant: isConstant,
        vectorized: false,
        selective: !isConstant && secondaryKeys.length > 0,
        selectiveLogic: 0,
        addMemo: Boolean(entry.comment),
        order: 100,
        position: 0,
        disable: false,
        ignoreBudget: false,
        excludeRecursion: false,
        preventRecursion: false,
        matchPersonaDescription: false,
        matchCharacterDescription: false,
        matchCharacterPersonality: false,
        matchCharacterDepthPrompt: false,
        matchScenario: false,
        matchCreatorNotes: false,
        delayUntilRecursion: 0,
        probability: 100,
        useProbability: true,
        depth: 4,
        outletName: '',
        group: '',
        groupOverride: false,
        groupWeight: 100,
        scanDepth: null,
        caseSensitive: null,
        matchWholeWords: null,
        useGroupScoring: null,
        automationId: '',
        role: 0,
        sticky: null,
        cooldown: null,
        delay: null,
        triggers: [],
    };
}

async function getExistingWorldNames(context) {
    const response = await fetch('/api/worldinfo/list', {
        method: 'POST',
        headers: context.getRequestHeaders(),
    });

    if (!response.ok) {
        return [];
    }

    const items = await response.json();
    return Array.isArray(items) ? items.map(item => item?.name).filter(Boolean) : [];
}

function ensureUniqueName(baseName, existingNames) {
    if (!existingNames.includes(baseName)) {
        return baseName;
    }

    let index = 2;
    while (existingNames.includes(`${baseName} ${index}`)) {
        index += 1;
    }
    return `${baseName} ${index}`;
}

function resolveWorldbookName(characterName, existingNames, preferredName) {
    const preferred = String(preferredName || '').trim();
    if (preferred) {
        return preferred;
    }

    return ensureUniqueName(`${characterName} 世界书`, existingNames);
}

export async function saveGeneratedWorldbook(context, characterName, entries, preferredName = '') {
    const existingNames = await getExistingWorldNames(context);
    const worldName = resolveWorldbookName(characterName, existingNames, preferredName);
    const data = {
        entries: Object.fromEntries(entries.map((entry, index) => [index, buildWorldInfoEntry(entry, index)])),
    };

    await context.saveWorldInfo(worldName, data, true);
    await context.updateWorldInfoList();
    return worldName;
}

export async function bindWorldbookToCharacter(context, characterId, worldName) {
    if (!worldName || Number.isNaN(Number(characterId))) {
        throw new Error('绑定世界书失败：缺少角色或世界书名称');
    }

    await context.writeExtensionField(Number(characterId), 'world', worldName);
}
