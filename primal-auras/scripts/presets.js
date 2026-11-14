/**
 * Presets shipped with the module. They are written for D&D 5e (2024 rules where they differ) but
 * every field can be edited in the preset library, and the purely visual presets work in any system.
 * "@" values in modifiers and formulas are read from the aura's SOURCE (e.g. the paladin).
 */
export const DEFAULT_PRESETS = [
  {
    id: "paAuraProtection",
    name: "Aura of Protection",
    description: "Paladin. You and allies in the aura add your Charisma modifier (minimum +1) to saving throws.",
    shape: "circle", radius: 10, measureFrom: "edge",
    fillColor: "#f5c542", fillAlpha: 0.12, borderColor: "#f5c542", borderAlpha: 0.8, borderWidth: 3,
    activation: "passive",
    effects: [{
      id: "paAuraProtectionFx", name: "Aura of Protection", img: "icons/svg/holy-shield.svg",
      mode: "continuous", affects: "allies", includeSelf: true,
      changes: [{ key: "system.bonuses.abilities.save", type: "add", value: "max(1, @abilities.cha.mod)" }]
    }]
  },
  {
    id: "paSpiritGuardians",
    name: "Spirit Guardians",
    description: "Enemies that enter the emanation or end their turn in it make a Wisdom save against your spell save DC: 3d8 radiant, half on a success (once per turn). Their speed is halved while inside.",
    shape: "circle", radius: 15, measureFrom: "edge",
    fillColor: "#ffd166", fillAlpha: 0.14, borderColor: "#f4a261", borderAlpha: 0.9, borderWidth: 3,
    activation: "manual", enableOnUse: true, endWithConcentration: true,
    effects: [
      {
        id: "paSpiritGuardiansDmg", name: "Spirit Guardians", img: "icons/svg/angel.svg",
        mode: "triggered", affects: "enemies",
        triggers: { onEnter: true, targetTurnEnd: true, targetTurnStart: false },
        oncePerTurn: true,
        save: { ability: "wis", dc: "@attributes.spell.dc", onSuccess: "half" },
        damage: { formula: "3d8", type: "radiant" }
      },
      {
        id: "paSpiritGuardiansSlow", name: "Spirit Guardians (Slowed)", img: "icons/svg/angel.svg",
        mode: "continuous", affects: "enemies",
        changes: [{ key: "system.attributes.movement.walk", type: "multiply", value: "0.5" }]
      }
    ]
  },
  {
    id: "paAuraOfFear",
    name: "Aura of Dread",
    description: "Enemies that enter or start their turn in the aura make a DC 15 Wisdom save or are Frightened until the end of their next turn.",
    shape: "circle", radius: 30, measureFrom: "edge",
    fillColor: "#7b2cbf", fillAlpha: 0.12, borderColor: "#9d4edd", borderAlpha: 0.85, borderWidth: 3,
    effects: [{
      id: "paAuraOfFearFx", name: "Aura of Dread", img: "icons/svg/terror.svg",
      mode: "triggered", affects: "enemies",
      triggers: { onEnter: true, targetTurnStart: true },
      oncePerTurn: true,
      save: { ability: "wis", dc: "15", onSuccess: "none" },
      statuses: ["frightened"],
      duration: { type: "turnEndTarget" }
    }]
  },
  {
    id: "paStench",
    name: "Stench",
    description: "Any other creature that starts its turn within 5 feet makes a DC 10 Constitution save or is Poisoned until the start of its next turn.",
    shape: "grid", radius: 5, measureFrom: "edge",
    fillColor: "#80b918", fillAlpha: 0.16, borderColor: "#55a630", borderAlpha: 0.9, borderWidth: 2,
    effects: [{
      id: "paStenchFx", name: "Stench", img: "icons/svg/poison.svg",
      mode: "triggered", affects: "all",
      triggers: { onEnter: false, targetTurnStart: true },
      oncePerTurn: true,
      save: { ability: "con", dc: "10", onSuccess: "none" },
      statuses: ["poisoned"],
      duration: { type: "turnStartTarget" }
    }]
  },
  {
    id: "paBurningAura",
    name: "Burning Aura",
    description: "Creatures that enter or start their turn in the aura take 1d10 fire damage (once per turn).",
    shape: "circle", radius: 5, measureFrom: "edge",
    fillColor: "#e85d04", fillAlpha: 0.18, borderColor: "#dc2f02", borderAlpha: 0.9, borderWidth: 3,
    effects: [{
      id: "paBurningAuraFx", name: "Burning Aura", img: "icons/svg/fire.svg",
      mode: "triggered", affects: "enemies",
      triggers: { onEnter: true, targetTurnStart: true },
      oncePerTurn: true,
      damage: { formula: "1d10", type: "fire" }
    }]
  },
  {
    id: "paRegeneration",
    name: "Regenerative Aura",
    description: "You and allies that start their turn in the aura regain 1d4 hit points.",
    shape: "circle", radius: 10, measureFrom: "edge",
    fillColor: "#2a9d8f", fillAlpha: 0.12, borderColor: "#52b788", borderAlpha: 0.85, borderWidth: 3,
    effects: [{
      id: "paRegenerationFx", name: "Regenerative Aura", img: "icons/svg/regen.svg",
      mode: "triggered", affects: "allies", includeSelf: true,
      triggers: { onEnter: false, targetTurnStart: true },
      oncePerTurn: true,
      healing: { formula: "1d4", type: "healing" }
    }]
  },
  {
    id: "paBlessingAura",
    name: "Aura of Blessing",
    description: "Allies inside add 1d4 to attack rolls and saving throws.",
    shape: "circle", radius: 30, measureFrom: "edge",
    fillColor: "#ffe066", fillAlpha: 0.08, borderColor: "#fcbf49", borderAlpha: 0.8, borderWidth: 2,
    effects: [{
      id: "paBlessingAuraFx", name: "Aura of Blessing", img: "icons/svg/sun.svg",
      mode: "continuous", affects: "allies", includeSelf: true,
      changes: [
        { key: "system.bonuses.mwak.attack", type: "add", value: "+1d4" },
        { key: "system.bonuses.rwak.attack", type: "add", value: "+1d4" },
        { key: "system.bonuses.msak.attack", type: "add", value: "+1d4" },
        { key: "system.bonuses.rsak.attack", type: "add", value: "+1d4" },
        { key: "system.bonuses.abilities.save", type: "add", value: "+1d4" }
      ]
    }]
  },
  {
    id: "paChillingField",
    name: "Chilling Field",
    description: "Enemies inside have their walking speed reduced by 10 feet.",
    shape: "grid", radius: 10, measureFrom: "edge",
    fillColor: "#48cae4", fillAlpha: 0.14, borderColor: "#00b4d8", borderAlpha: 0.85, borderWidth: 2,
    effects: [{
      id: "paChillingFieldFx", name: "Chilling Field", img: "icons/svg/frozen.svg",
      mode: "continuous", affects: "enemies",
      changes: [{ key: "system.attributes.movement.walk", type: "add", value: "-10" }]
    }]
  },
  {
    id: "paReachRing",
    name: "Reach Ring (donut)",
    description: "Visual only: the ring of spaces between 5 and 10 feet away, e.g. to show a reach weapon's extra range.",
    shape: "grid", radius: 10, innerRadius: 5, measureFrom: "edge",
    fillColor: "#ef476f", fillAlpha: 0.12, borderColor: "#ef476f", borderAlpha: 0.9, borderWidth: 2,
    effects: []
  },
  {
    id: "paRangeMarker",
    name: "Range Marker",
    description: "Visual only: an outline for measuring a range at a glance.",
    shape: "circle", radius: 30, measureFrom: "edge",
    fillColor: "#ffffff", fillAlpha: 0, borderColor: "#ffffff", borderAlpha: 0.6, borderWidth: 2,
    effects: []
  }
];
