# Changelog

## 1.1.1
- **Fixed the weather bar failing to draw while hidden.** When the bar had nothing to show (the bar turned off, or for players before there is any weather or while it is hidden from them), its template drew nothing at all, and Foundry refuses that (*Template part 'bar' must render a single HTML element*), so it threw an error instead of hiding. It now always draws the bar and leaves it empty while hidden. A new check (`tests/template.test.mjs`) keeps the template to one root element.

## 1.1.0
- **Weather rules that apply.** A new setting, *Weather rules apply to rolls* (on to start with). On outdoor scenes (marked from the weather bar's ⋮ menu, or every scene not turned off when the weather is shown on all of them), Primal Status puts the weather on rolls: Disadvantage on Wisdom (Perception) checks in heavy rain, heavy snow, fog and blowing sand, and on ranged weapon attacks in strong wind. In extreme heat or cold, the GM gets a whispered reminder each hour that passes that saving throws are due.
- The API adds `isOutdoors(scene)`, `activeRules(scene)` and `rollModifiers(scene)`.
