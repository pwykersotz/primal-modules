# Changelog

## 1.1.0
- **Weather rules that apply.** A new setting, *Weather rules apply to rolls* (on to start with). On outdoor scenes (marked from the weather bar's ⋮ menu, or every scene not turned off when the weather is shown on all of them), Primal Status puts the weather on rolls: Disadvantage on Wisdom (Perception) checks in heavy rain, heavy snow, fog and blowing sand, and on ranged weapon attacks in strong wind. In extreme heat or cold, the GM gets a whispered reminder each hour that passes that saving throws are due.
- The API adds `isOutdoors(scene)`, `activeRules(scene)` and `rollModifiers(scene)`.
