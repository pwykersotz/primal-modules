export const MODULE_ID = "primal-auras";
export const FLAG = "auras";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const DEFAULT_EFFECT_ICON = "icons/svg/aura.svg";

const T = `modules/${MODULE_ID}/templates`;
export const TEMPLATES = {
  palette: `${T}/hud-palette.hbs`,
  config: `${T}/aura-config.hbs`,
  presets: `${T}/preset-manager.hbs`,
  documentAuras: `${T}/document-auras.hbs`,
  chat: `${T}/chat-card.hbs`
};

/** Foundry core generation (13, 14, ...). */
export const generation = () => game.release?.generation ?? 13;

export function localize(key, data) {
  if (!data) return game.i18n.localize(key);
  const fmt = game.i18n.format ?? game.i18n.localize;
  return fmt.call(game.i18n, key, data);
}

export function renderTemplate(path, data) {
  const fn = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
  return fn(path, data);
}

export function loadTemplates(paths) {
  const fn = foundry.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  return fn(paths);
}

export function getSetting(key) {
  try { return game.settings.get(MODULE_ID, key); }
  catch { return undefined; }
}

/** Only one connected GM runs automation, so effects are never applied twice. */
export function isActiveGM() {
  if (!game.user?.isGM) return false;
  const active = game.users?.activeGM;
  return active ? active.isSelf ?? (active.id === game.user.id) : true;
}

export const RollClass = () => foundry.dice?.Roll ?? globalThis.Roll;
export const FormDataClass = () => foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
export const DialogV2 = () => foundry.applications.api.DialogV2;

export function fromUuidSafe(uuid) {
  const fn = foundry.utils.fromUuid ?? globalThis.fromUuid;
  return fn(uuid);
}

export function warn(...args) { console.warn("Primal Auras |", ...args); }
export function error(...args) { console.error("Primal Auras |", ...args); }

export function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
