/* -------------------------------------------- */
/*  Token settings: animations for one token    */
/* -------------------------------------------- */

const TOKEN_ANIMATIONS_FIELD = `flags.${MODULE_ID}.animations`;

/**
 * Add "Animate this token's statuses" to the Appearance tab of a token's settings (and of an actor's
 * prototype token), as the token's flag; unticked, the token shows no animations for anyone. It's
 * saved the moment it's ticked or unticked, so it doesn't depend on the window having (or showing)
 * a save button; it also stays part of the form, so saving the form saves the same value.
 */
function addTokenAnimationsField(app, html) {
  try {
    const root = html instanceof HTMLElement ? html : (html?.[0] ?? app?.element ?? null);
    if (!(root instanceof HTMLElement) || root.querySelector(`[name="${TOKEN_ANIMATIONS_FIELD}"]`)) return;
    const tab = root.querySelector('.tab[data-tab="appearance"]') ?? root.querySelector('.tab[data-tab="identity"]');
    if (!tab) return;
    const doc = app?.token ?? app?.document ?? app?.object;
    const group = document.createElement("div");
    group.className = "form-group mg-token-animations";
    group.innerHTML = `
      <label>${escapeHTML(loc("MIGHTYGUARD.TokenConfig.Animations.Name"))}</label>
      <div class="form-fields"><input type="checkbox" name="${TOKEN_ANIMATIONS_FIELD}" ${animationsOffFor(doc) ? "" : "checked"}></div>
      <p class="hint">${escapeHTML(loc("MIGHTYGUARD.TokenConfig.Animations.Hint"))}</p>`;
    tab.append(group);
    const input = group.querySelector("input");
    input.addEventListener("change", () => saveTokenAnimationsNow(app, doc, input.checked));
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not add the animations option to the token settings`, err);
  }
}

/**
 * Save the choice straight away: on the token itself, or on the actor's prototype token. The window
 * isn't redrawn (render: false), so other changes not yet saved in it are kept.
 */
async function saveTokenAnimationsNow(app, doc, on) {
  try {
    // The token in the scene (not a preview copy the window may be showing)
    if (app?.document?.documentName === "Token") doc = app.document;
    if (doc?.documentName === "Token") {
      if (!doc.id || typeof doc.update !== "function") return false;   // a token not created yet: saved with the form
      await doc.update({ [TOKEN_ANIMATIONS_FIELD]: !!on }, { render: false });
      return true;
    }
    const actor = app?.actor ?? doc?.parent ?? doc?.actor;
    if (actor?.documentName !== "Actor" || typeof actor.update !== "function") return false;
    await actor.update({ [`prototypeToken.${TOKEN_ANIMATIONS_FIELD}`]: !!on }, { render: false });
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not save the token's animation choice`, err);
    globalThis.ui?.notifications?.warn?.(loc("MIGHTYGUARD.TokenConfig.Animations.NotSaved"));
    return false;
  }
}

Hooks.on("renderTokenConfig", addTokenAnimationsField);
Hooks.on("renderPrototypeTokenConfig", addTokenAnimationsField);

/** Turn a token's animations on or off (for everyone who sees it). */
async function setTokenAnimations(token, on) {
  const doc = token?.document ?? token;
  if (!doc?.update) return;
  await doc.update({ [TOKEN_ANIMATIONS_FIELD]: !!on });
}

// Turning a token's animations on or off changes its icons (hidden or not, the Dead skull) and who can see it
Hooks.on("updateToken", (doc, change) => {
  const has = foundry.utils?.hasProperty;
  if (![MODULE_ID, ...LEGACY_MODULE_IDS].some(id => has?.(change ?? {}, `flags.${id}`))) return;
  const token = doc?.object;
  try {
    if (token && "redrawEffects" in (token.constructor?.RENDER_FLAGS ?? {})) token.renderFlags.set({ redrawEffects: true });
    else token?.drawEffects?.();
  } catch { /* not critical */ }
  setTimeout(refreshTokenVisibility, 0);
});
