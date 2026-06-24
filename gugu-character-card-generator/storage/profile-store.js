import { STORAGE_KEY, STORAGE_NAME } from '../constants.js';

function getSafeRecord(value) {
    return value && typeof value === 'object' ? value : {};
}

export function createProfileStore(localforage) {
    const database = localforage.createInstance({
        name: STORAGE_NAME,
        storeName: 'profiles',
    });

    async function readAll() {
        return getSafeRecord(await database.getItem(STORAGE_KEY));
    }

    async function writeAll(value) {
        await database.setItem(STORAGE_KEY, value);
    }

    return {
        async getApiKey(profileId) {
            const records = await readAll();
            return typeof records[profileId] === 'string' ? records[profileId] : '';
        },
        async saveApiKey(profileId, apiKey) {
            const records = await readAll();
            records[profileId] = String(apiKey || '');
            await writeAll(records);
        },
        async deleteApiKey(profileId) {
            const records = await readAll();
            delete records[profileId];
            await writeAll(records);
        },
    };
}
