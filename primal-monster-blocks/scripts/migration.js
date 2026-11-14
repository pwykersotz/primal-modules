import { MODULE_ID, LEGACY_ID } from "./constants.js";

/**
 * Settings that took the place of others, with the settings whose saved value they take on: the
 * stat block's column limit was briefly two settings, one for the panel and one for windows.
 */
const REPLACED = {
	"stat-block-columns": ["window-columns", "pane-columns"]
};

/**
 * Carry settings saved under the module's old id ("monsterblock") over to its new id, once each:
 * the world's settings when the GM logs in, and each user's own settings on their own computer.
 * The old values are left where they were. Settings that replaced others take on their values too.
 *
 * @return {Promise<string[]>} The settings that were carried over
 */
export async function migrateSettings() {
	const moved = [];
	for (const [id, config] of game.settings.settings) {
		if (!id.startsWith(`${MODULE_ID}.`)) continue;
		const key = id.slice(MODULE_ID.length + 1);
		const world = config.scope === "world";
		if (world && !game.user?.isGM) continue;
		if (isStored(world, `${MODULE_ID}.${key}`)) continue;
		let value = cast(readStored(world, `${LEGACY_ID}.${key}`), config);
		// The first replaced setting that was changed from its default.
		for (const old of REPLACED[key] ?? []) {
			if (value !== undefined && value !== config.default) break;
			value = cast(readStored(world, `${MODULE_ID}.${old}`), config) ?? value;
		}
		if (value === undefined || (REPLACED[key] && value === config.default)) continue;
		try {
			await game.settings.set(MODULE_ID, key, value);
			moved.push(key);
		}
		catch (err) {
			console.warn(`Primal Monster Blocks | Could not carry over the setting "${key}"`, err);
		}
	}
	if (moved.length) console.log(`Primal Monster Blocks | Carried over ${moved.length} settings from Monster Blocks:`, moved);
	return moved;
}

/** The stored world setting document for a key, if there is one. */
function worldSetting(key) {
	const storage = game.settings.storage?.get("world");
	return storage?.getSetting?.(key) ?? storage?.find?.(s => s.key === key);
}

/** Whether a setting has a saved value (rather than its default). */
function isStored(world, key) {
	if (world) return Boolean(worldSetting(key));
	return game.settings.storage?.get("client")?.getItem?.(key) != null;
}

/** A saved setting value, as stored. */
function readStored(world, key) {
	let raw;
	if (world) {
		const doc = worldSetting(key);
		if (!doc) return undefined;
		raw = doc._source?.value ?? doc.value;
	}
	else {
		raw = game.settings.storage?.get("client")?.getItem?.(key);
		if (raw == null) return undefined;
	}
	if (typeof raw !== "string") return raw;
	try {
		return JSON.parse(raw);
	}
	catch (e) {
		return raw;
	}
}

/** A saved value as the type the setting expects, or undefined if it can't be. */
function cast(value, config) {
	if (value === undefined || value === null) return undefined;
	if (config.type === Boolean) return typeof value === "boolean" ? value : value === "true";
	if (config.type === Number) {
		const n = Number(value);
		return Number.isFinite(n) ? n : undefined;
	}
	if (config.type === String) return String(value);
	return value;
}
