/* ---------- Monsters of Drakkenheim conditions ---------- */

/*
 * Which creatures have them. The animations: Clumsy, Enfeebled, Defenseless and Helpless are in
 * 13-fx-drakkenheim4.js, Sickened in 13-fx-drakkenheim5.js, Addled in 13-fx-drakkenheim6.js.
 */
const isAddled = actor => hasStatusMatching(actor, /(^|[^a-z])addled$/i);
const isClumsy = actor => hasStatusMatching(actor, /(^|[^a-z])clumsy$/i);
const isEnfeebled = actor => hasStatusMatching(actor, /(^|[^a-z])enfeebled$/i);
const isSickened = actor => hasStatusMatching(actor, /(^|[^a-z])sickened$/i);
const isDefenseless = actor => hasStatusMatching(actor, /(^|[^a-z])defen[cs]eless$/i);
const isHelpless = actor => hasStatusMatching(actor, /(^|[^a-z])helpless$/i);
