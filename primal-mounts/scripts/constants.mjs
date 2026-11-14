export const MODULE_ID = "primal-mounts";
export const SOCKET = `module.${MODULE_ID}`;

/** dnd5e creature sizes, smallest to largest (used when CONFIG.DND5E is unavailable). */
export const SIZE_ORDER = ["tiny", "sm", "med", "lg", "huge", "grg"];

/** Statuses that leave a creature Incapacitated (dnd5e also adds "incapacitated" to actor.statuses for most). */
export const INCAPACITATING = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious", "dead"];

/** How long an armed Veer redirect waits for the damage roll to be applied (ms). */
export const VEER_WINDOW = 5 * 60 * 1000;

export const ICONS = {
  mountedEffect: `modules/${MODULE_ID}/icons/mounted.svg`,
  riddenEffect: `modules/${MODULE_ID}/icons/ridden.svg`,
  mount: "fa-solid fa-horse",
  unmount: "fa-solid fa-person-walking-arrow-right",
  controlled: "fa-solid fa-route",
  independent: "fa-solid fa-shuffle",
  fallSave: "fa-solid fa-person-falling"
};
