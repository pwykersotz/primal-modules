/* -------------------------------------------- */
/*  Guidance checkbox on ability / skill checks */
/* -------------------------------------------- */

const GUIDANCE_FIELD = "mgGuidance";
const GUIDANCE_DIE = "1d4";

/** Which rolls in an open dialog have Guidance ticked (survives the dialog re-rendering). */
const guidanceState = new WeakMap();

/** Is this dnd5e roll dialog for an ability check (plain, skill, tool or initiative)? */
function isAbilityCheckDialog(app) {
  return !!app?.config?.hookNames?.includes?.("abilityCheck");
}

function formFlag(formData, key) {
  const v = formData?.object?.[key] ?? formData?.get?.(key);
  return v === true || v === "true" || v === "on";
}

// Add the checkbox under each "Situational Bonus" field.
Hooks.on("renderRollConfigurationDialog", (app, element) => {
  if (game.system.id !== "dnd5e" || !isAbilityCheckDialog(app)) return;
  if (!game.settings.get(MODULE_ID, "guidanceCheckbox")) return;
  const root = element instanceof HTMLElement ? element : (app.element ?? element?.[0]);
  const state = guidanceState.get(app) ?? new Set();
  guidanceState.set(app, state);

  for (const situational of root?.querySelectorAll('input[name^="roll."][name$=".situational"]') ?? []) {
    const index = Number(situational.name.split(".")[1]);
    const name = `roll.${index}.${GUIDANCE_FIELD}`;
    if (root.querySelector(`[name="${name}"]`)) continue;
    const group = situational.closest(".form-group") ?? situational.parentElement;
    const id = `${app.id}-${GUIDANCE_FIELD}-${index}`;
    const row = document.createElement("div");
    row.className = "form-group mg-guidance";
    row.style.marginTop = "4px";
    row.innerHTML = `
      <label class="checkbox" for="${id}" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" id="${id}" name="${name}" ${state.has(index) ? "checked" : ""}>
        <span>${game.i18n.localize("MIGHTYGUARD.Guidance.Label")}</span>
        <span class="hint" style="margin:0;">${game.i18n.localize("MIGHTYGUARD.Guidance.Hint")}</span>
      </label>`;
    row.querySelector("input").addEventListener("change", ev => {
      if (ev.currentTarget.checked) state.add(index); else state.delete(index);
    });
    group.after(row);
  }
});

// When the dialog builds the roll, add 1d4 if Guidance is ticked.
Hooks.on("dnd5e.buildAbilityCheckRollConfig", (app, config, formData, index) => {
  if (!game.settings.get(MODULE_ID, "guidanceCheckbox")) return;
  const key = `roll.${index}.${GUIDANCE_FIELD}`;
  const on = formData ? formFlag(formData, key) : !!guidanceState.get(app)?.has(index);
  if (!on || !Array.isArray(config.parts)) return;
  config.parts.push(GUIDANCE_DIE);
});

