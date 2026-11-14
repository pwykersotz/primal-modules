import { ICONS, MODULE_ID } from "./constants.mjs";
import { mountCandidates, requestMount, requestToggleControl, requestUnmount } from "./mounting.mjs";
import { forcedMovementSave } from "./rules.mjs";
import { controlOf, getPair, loc } from "./util.mjs";

export function registerHud() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("updateToken", (doc, changes) => {
    if ( !foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) ) return;
    const hud = canvas.tokens?.hud;
    if ( !hud?.rendered || !hud.object ) return;
    const pair = getPair(hud.object.document);
    const related = (hud.object.document === doc) || (pair && ((pair.rider === doc) || (pair.mount === doc)));
    if ( related ) hud.render();
  });
}

function makeButton({ icon, tooltip, classes = [], onClick, active = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("control-icon", "primal-mounts-control", ...classes);
  if ( active ) button.classList.add("active");
  button.dataset.tooltip = tooltip;
  button.setAttribute("aria-label", tooltip);
  button.innerHTML = `<i class="${icon}" inert></i>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

function onRenderTokenHUD(hud, html) {
  const root = (html instanceof HTMLElement) ? html : (html?.[0] ?? hud.element);
  const token = hud.object;
  const doc = token?.document;
  if ( !root || !doc ) return;
  root.querySelectorAll(".primal-mounts-control").forEach(el => el.remove());
  const column = root.querySelector(".col.left") ?? root.querySelector(".col") ?? root;
  const pair = getPair(doc);

  if ( pair ) {
    const controlled = controlOf(pair.mount) === "controlled";
    column.append(makeButton({
      icon: ICONS.unmount,
      tooltip: loc("HUD.Unmount", { rider: pair.rider.name, mount: pair.mount.name }),
      classes: ["primal-mounts-unmount"],
      onClick: () => requestUnmount(doc)
    }));
    column.append(makeButton({
      icon: controlled ? ICONS.controlled : ICONS.independent,
      tooltip: loc(controlled ? "HUD.ControlledToggle" : "HUD.IndependentToggle", { mount: pair.mount.name }),
      classes: ["primal-mounts-control-mode"],
      active: controlled,
      onClick: () => requestToggleControl(doc)
    }));
    if ( pair.rider.isOwner || game.user.isGM ) {
      column.append(makeButton({
        icon: ICONS.fallSave,
        tooltip: loc("HUD.FallSave", { rider: pair.rider.name }),
        classes: ["primal-mounts-fall"],
        onClick: () => forcedMovementSave(pair)
      }));
    }
    return;
  }

  const candidates = mountCandidates(doc);
  if ( !candidates.length ) return;
  const first = candidates[0];
  const tooltip = candidates.length === 1
    ? loc("HUD.Mount", { rider: first.rider.name, mount: first.mount.name })
    : loc("HUD.MountChoose");
  column.append(makeButton({
    icon: ICONS.mount,
    tooltip,
    classes: ["primal-mounts-mount", "pm-suggest"],
    onClick: () => requestMount(doc)
  }));
}
