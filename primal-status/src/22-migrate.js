/* -------------------------------------------- */
/*  Moving over from earlier module IDs         */
/* -------------------------------------------- */

/*
 * This module was installed as "mighty-guard" before 3.0.0 and as "enhanced-status-effects" (Enhanced
 * Status Effects) from 3.0.0 to 3.2.3. Foundry keys settings and file paths by the module's ID, so the
 * first time it runs as "primal-status" it carries everything over, once, from whichever earlier ID
 * has it (the newest first):
 *  - the world's settings (by the GM) and each player's own settings (in their own browser), unless
 *    they've already been set under the new ID;
 *  - the images of status effects already on creatures (modules/enhanced-status-effects/... and
 *    modules/mighty-guard/... become modules/primal-status/...), and the Grappled overlay image if it
 *    was the module's own;
 *  - macros that call the module's API through game.modules.get("enhanced-status-effects") (or the
 *    older ID).
 * Flags kept under an earlier ID (a token's "Animate this token's statuses", Contamination levels, Dead
 * applied by this module) are read from any of them (see moduleFlag), so they stay where they are.
 */

/** Settings that only record this carrying-over: never copied themselves. */
const MIGRATION_MARKERS = new Set(["migratedWorld", "migratedClient"]);

/** A value as Foundry stored it (a JSON string), or as it was if it isn't JSON. */
function storedValue(raw) {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

/** The settings this module registers, as { key, scope, type }. */
function ownSettings() {
  const out = [];
  for (const [id, config] of game.settings?.settings ?? []) {
    if (typeof id !== "string" || !id.startsWith(`${MODULE_ID}.`)) continue;
    if (MIGRATION_MARKERS.has(config?.key ?? id.slice(MODULE_ID.length + 1))) continue;
    out.push({ key: config?.key ?? id.slice(MODULE_ID.length + 1), scope: config?.scope, type: config?.type });
  }
  return out;
}

/** A stored value in the type the setting expects, or undefined if it can't be one. */
function settingValueOfType(type, value) {
  if (value === undefined || value === null) return undefined;
  if (type === Boolean) return typeof value === "boolean" ? value : (value === "true" ? true : value === "false" ? false : undefined);
  if (type === Number) { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
  if (type === String) return typeof value === "string" ? value : String(value);
  if (type === Array) return Array.isArray(value) ? value : undefined;
  if (type === Object) return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  return value;
}

/** Copy the world's settings from the earlier IDs (the GM's client). Returns how many were copied. */
async function migrateWorldSettings() {
  const store = game.settings?.storage?.get?.("world");
  if (!store) return 0;
  const all = typeof store.contents === "object" ? store.contents : [...store];
  const stored = key => all.find(s => s?.key === key);
  let moved = 0;
  for (const { key, scope, type } of ownSettings()) {
    if (scope !== "world" || stored(`${MODULE_ID}.${key}`)) continue;
    const old = LEGACY_MODULE_IDS.map(id => stored(`${id}.${key}`)).find(Boolean);
    const value = settingValueOfType(type, storedValue(old?.value));
    if (value === undefined) continue;
    try { await game.settings.set(MODULE_ID, key, value); moved++; }
    catch (err) { console.warn(`${MODULE_ID} | Could not carry over the setting ${key}`, err); }
  }
  return moved;
}

/** Copy this player's own settings from the earlier IDs (kept in their browser). Returns how many were copied. */
async function migrateClientSettings() {
  let storage = null;
  try { storage = game.settings?.storage?.get?.("client") ?? globalThis.localStorage; } catch { return 0; }
  if (typeof storage?.getItem !== "function") return 0;
  let moved = 0;
  for (const { key, scope, type } of ownSettings()) {
    if (scope !== "client" || storage.getItem(`${MODULE_ID}.${key}`) !== null) continue;
    const raw = LEGACY_MODULE_IDS.map(id => storage.getItem(`${id}.${key}`)).find(v => v !== null && v !== undefined);
    if (raw === null || raw === undefined) continue;
    const value = settingValueOfType(type, storedValue(raw));
    if (value === undefined) continue;
    try { await game.settings.set(MODULE_ID, key, value); moved++; }
    catch (err) { console.warn(`${MODULE_ID} | Could not carry over your setting ${key}`, err); }
  }
  return moved;
}

/** The new path for a file in an earlier module folder, or null if it isn't one. */
function movedModulePath(src) {
  if (typeof src !== "string") return null;
  for (const id of LEGACY_MODULE_IDS) {
    const prefix = `modules/${id}/`;
    if (src.startsWith(prefix)) return `${MODULE_PATH}/${src.slice(prefix.length)}`;
  }
  return null;
}

/** Point status effects on creatures (in the sidebar and on every scene) at the new folder. */
async function migrateEffectImages() {
  const actors = new Set();
  for (const actor of game.actors ?? []) actors.add(actor);
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) if (!token.actorLink && token.actor) actors.add(token.actor);
  }
  let moved = 0;
  for (const actor of actors) {
    const updates = [];
    for (const effect of actor.effects ?? []) {
      const img = movedModulePath(effect.img);
      if (img && effect.id) updates.push({ _id: effect.id, img });
    }
    if (!updates.length) continue;
    try { await actor.updateEmbeddedDocuments("ActiveEffect", updates); moved += updates.length; }
    catch (err) { console.warn(`${MODULE_ID} | Could not update the status images on ${actor.name}`, err); }
  }
  return moved;
}

const OLD_API_CALL = new RegExp(`game\\.modules\\.get\\(\\s*(["'\`])(?:${LEGACY_MODULE_IDS.join("|")})\\1\\s*\\)`, "g");

/** Macros that reach the module's API by an earlier ID. */
async function migrateMacros() {
  let moved = 0;
  for (const macro of game.macros ?? []) {
    const command = macro?.command;
    if (typeof command !== "string" || !OLD_API_CALL.test(command)) continue;
    OLD_API_CALL.lastIndex = 0;
    const updated = command.replace(OLD_API_CALL, (m, q) => `game.modules.get(${q}${MODULE_ID}${q})`);
    try { await macro.update({ command: updated }); moved++; }
    catch (err) { console.warn(`${MODULE_ID} | Could not update the macro ${macro.name}`, err); }
  }
  OLD_API_CALL.lastIndex = 0;
  return moved;
}

/**
 * Carry everything over from the old module ID, once per world (by the active GM) and once per
 * player's browser. Safe to call again: nothing already set under the new ID is overwritten.
 */
async function migrateFromOldModuleId() {
  const done = key => { try { return !!game.settings.get(MODULE_ID, key); } catch { return true; } };
  const report = { settings: 0, images: 0, macros: 0 };
  if (typeof game.settings?.set !== "function") return report;
  if (!done("migratedClient")) {
    report.settings += await migrateClientSettings();
    await game.settings.set(MODULE_ID, "migratedClient", true);
  }
  const gm = game.users?.activeGM;
  const isActiveGM = !!game.user?.isGM && (!gm || (gm.isSelf ?? gm.id === game.user.id));
  if (isActiveGM && !done("migratedWorld")) {
    report.settings += await migrateWorldSettings();
    const grapple = movedModulePath(game.settings.get(MODULE_ID, "grappleImagePath"));
    if (grapple) { await game.settings.set(MODULE_ID, "grappleImagePath", grapple); report.settings++; }
    report.images = await migrateEffectImages();
    report.macros = await migrateMacros();
    await game.settings.set(MODULE_ID, "migratedWorld", true);
  }
  if (report.settings || report.images || report.macros) {
    const text = loc("MIGHTYGUARD.Migrate.Done").replace("{settings}", report.settings).replace("{images}", report.images).replace("{macros}", report.macros);
    globalThis.ui?.notifications?.info?.(text);
    console.log(`${MODULE_ID} | ${text}`);
  }
  // An old copy still switched on as well would run everything twice
  const oldActive = LEGACY_MODULE_IDS.find(id => game.modules?.get?.(id)?.active);
  if (game.user?.isGM && oldActive) {
    globalThis.ui?.notifications?.warn?.(loc("MIGHTYGUARD.Migrate.OldActive").replace("{id}", oldActive), { permanent: true });
  }
  return report;
}
