import { DIRECTORIES, loc, pluralLabel } from "./constants.mjs";
import { chooseOne, isChosen } from "./state.mjs";

/**
 * The getCompendiumContextOptions hook: right-clicking a compendium in Foundry's Compendium sidebar offers
 * "Show in Actors" (or Items, Scenes...) or "Remove from Actors", matching the compendium's type.
 * @param {CompendiumDirectory} app
 * @param {ContextMenuEntry[]} menuItems
 */
export function addCompendiumContextOptions(app, menuItems) {
  if ( !game.user?.isGM || !Array.isArray(menuItems) ) return;
  const packOf = li => game.packs.get(li?.closest("[data-pack]")?.dataset.pack);
  for ( const documentName of Object.values(DIRECTORIES) ) {
    const directory = pluralLabel(documentName);
    menuItems.push({
      label: loc("Context.Show", { directory }),
      icon: "fa-solid fa-thumbtack",
      visible: li => {
        const pack = packOf(li);
        return (pack?.documentName === documentName) && !isChosen(pack.collection);
      },
      onClick: (event, li) => {
        const pack = packOf(li);
        if ( pack ) return chooseOne(pack.collection, true);
      }
    }, {
      label: loc("Context.Hide", { directory }),
      icon: "fa-solid fa-thumbtack-slash",
      visible: li => {
        const pack = packOf(li);
        return (pack?.documentName === documentName) && isChosen(pack.collection);
      },
      onClick: (event, li) => {
        const pack = packOf(li);
        if ( pack ) return chooseOne(pack.collection, false);
      }
    });
  }
}
