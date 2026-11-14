# Primal Weather

A weather generator in a small bar under dnd5e's calendar. Built for Foundry V14 and dnd5e 6.x.

> **Made with AI.** This module was written with Claude, an AI model made by Anthropic. See [Made with AI](#made-with-ai) below.

## The weather bar

A strip under the calendar shows today's weather: an icon, the weather, the temperature and the wind, for example **Heavy rain · 61°F · Strong wind ⚠**.

- **The temperature follows the clock.** It's coldest around sunrise and warmest in mid-afternoon, then falls toward tomorrow's low, so moving the calendar's time changes it.
- **Hover the bar** for the details: the high and low, the wind, the season and climate, and the **rules** that apply (heavy rain, strong wind, fog, extreme heat or cold, ice). A ⚠ on the bar means there are some. The GM also sees **tomorrow's forecast** there.
- **The icon changes at night** (a moon instead of the sun on clear nights), using dnd5e's sunrise and sunset.
- It fades with the rest of the interface like the calendar does, and sits above Primal Combat's carousel when both are showing. Without the calendar it takes the calendar's place at the top.

The GM has two buttons either side of the weather:

- **🎲** rolls new weather for today.
- **⋮** opens a menu: roll new weather, change the weather, show the weather on this scene's map (or stop), post the weather to chat (or whisper it to the GMs), and hide the weather from players (or show it again).
- **Clicking the weather** opens the weather window.

## How the weather is rolled

Each day's weather is rolled for the **climate** and the **season**, and follows on from the day before:

- **Spells and fronts last a while.** A warm or cold spell carries into the next few days, and a wet day makes the next one likelier to be wet (rain eases off a step at a time rather than stopping dead).
- **Rain, sleet or snow** depends on the temperature, so the same storm is a thunderstorm in summer and a blizzard in winter.
- **Fog** only comes with still air, and **storms** and **dust storms** always bring a strong wind.
- **Seasons blend into each other.** The climates describe the middle of each season, and the days between warm up or cool down gradually, so the first day of spring isn't suddenly warm.

The weather can be: clear, partly cloudy, overcast, fog, drizzle, rain, heavy rain, thunderstorm, sleet, ice storm, light snow, snow, heavy snow, blizzard, or dust storm. The wind is calm, breezy, windy, strong or a gale.

### Climates

| Climate | What it's like |
| --- | --- |
| Temperate | Four seasons, rain all year, snow in winter (the default). |
| Coastal | Mild all year, often foggy, windy and grey. |
| Mountain | Cold nights, windy, snow much of the year, sudden summer storms. |
| Arctic | Bitter, dangerous winters and a short, cool summer. |
| Desert | Scorching days and cold nights. Rare, sudden rain, and dust storms. |
| Tropical | Hot all year. Summer is the wet season (downpours and thunderstorms), winter the dry season. |

### Seasons

The season comes from dnd5e's calendar (Gregorian, Greyhawk, Harptos or Khorvaire, or any calendar whose seasons are named spring, summer, autumn/fall and winter). For a calendar without seasons it's worked out from the time of year, as in Earth's northern hemisphere. The **Season** setting can fix it to one season instead.

### As the days pass

- **A new day** rolls new weather, on the GM's client (a GM needs to be logged in). Tomorrow's weather is rolled a day ahead, which is the GM's forecast, and becomes today's weather when the day comes, so players see the new weather straight away.
- **Jumping ahead** several days rolls each of them, so the weather moves on naturally.
- **Going back in time** shows the weather those days actually had, and going forward again shows the same weather as before.
- With **Roll new weather each day** turned off, the weather stays as it is until the GM rolls or changes it.

## The weather window (GM)

Click the weather, or **⋮ → Change the weather…**:

- **Climate** and **Season**: the same as the settings. Changing either rolls tomorrow's forecast again; today's weather stays until you roll it.
- **Today's weather**: the weather, the high and low (in your temperature units), and the wind.
- **Roll new weather** rolls today again for the climate and season chosen. **Save** keeps the weather shown as today's, if you changed it. Either way, tomorrow follows on from today, so a heat wave you set carries on for a few days.

Rolling or changing today's weather rolls tomorrow's forecast again too.

## Weather on the map

Primal Weather can show the weather on scene maps with Foundry's own effects:

| Weather | Map effect |
| --- | --- |
| Drizzle, rain, sleet | Rain |
| Heavy rain, thunderstorm, ice storm | Rain storm |
| Fog | Fog |
| Light snow, snow, heavy snow | Snow |
| Blizzard | Blizzard |

Clear and cloudy skies and dust storms have no effect (Foundry has none for dust).

By default it's shown on **scenes marked as outdoors**: open the scene and use **⋮ → Show the weather on this scene's map**. The **Weather on the map** setting can show it on every scene instead (with **⋮ → Stop showing the weather on this scene's map** for the indoor ones), or never.

- A scene with **its own weather** set in Scene Config (Ambience) keeps it.
- Foundry's **Suppress Weather** region behaviour still works, for the inside of a building on an outdoor map.
- Each player's computer draws it, so the scene itself isn't changed and the map isn't redrawn. Foundry's performance setting decides which effects are drawn, as for any scene weather.

## Settings

| Setting | Who | What it does |
| --- | --- | --- |
| Climate | World | Temperate (default), coastal, mountain, arctic, desert or tropical. |
| Season | World | From the calendar (default), or fixed to spring, summer, autumn or winter. |
| Roll new weather each day | World | On by default. Off keeps the weather until the GM rolls or changes it. |
| Who sees the weather | World | Everyone (default), or only the GM. |
| Weather on the map | World | Never, scenes marked as outdoors (default), or every scene unless turned off for it. |
| Announce new weather in chat | World | No (default), whisper to the GMs, or everyone. Posts a card each new day and whenever the GM rolls or sets the weather. |
| Show the weather bar | Per browser | Turn the bar off on this computer. |
| Temperature units | Per browser | Fahrenheit (default), Celsius, or both. |

## The rules reminders

These show in the bar's tooltip and the chat card when they apply. They follow the Dungeon Master's Guide's weather rules.

**Rules that apply** (the *Weather rules apply to rolls* setting, on to start with). On outdoor scenes, meaning the scenes that show the weather (⋮ → **Show the weather on this scene's map**, or every scene not turned off when **Weather on the map** is set to every scene), Primal Status puts the weather on rolls: Disadvantage on Wisdom (Perception) checks in heavy precipitation, heavy rain, fog, blowing sand and strong wind, and on ranged weapon attacks in strong wind. The roll window and the chat card say why ("Heavy rain (if it relies on hearing)"), so a player can roll normally when the check doesn't rely on that sense. In extreme heat or cold, the GM gets a whispered reminder each hour that passes on the active scene that saving throws are due. Without Primal Status only the hourly reminder applies.

| Reminder | When |
| --- | --- |
| Heavy precipitation | Heavy rain, thunderstorm, ice storm, heavy snow, blizzard |
| Heavy rain | Heavy rain, thunderstorm, ice storm |
| Strong wind | A strong wind or a gale |
| Fog | Fog |
| Ice | Ice storm |
| Blowing sand | Dust storm |
| Extreme heat | The day's high is 100°F (38°C) or more |
| Extreme cold | The night's low is 0°F (-18°C) or less |

## For macros

```js
const api = game.modules.get("primal-weather").api;
api.getWeather();                 // {day, weather, yesterday, tomorrow, stale}: weather is {condition, high, low, wind, climate, season, manual, ...}, °F
api.roll();                       // roll today's weather again (GM)
api.setWeather({ condition: "fog", high: 52, low: 41, wind: "calm" });   // set today's weather (GM), °F
api.openDialog();                 // the GM's weather window
api.postToChat();                 // post the weather to chat; { whisper: true } for the GMs only
api.setSceneWeather(canvas.scene, true);   // show the weather on this scene's map; false to stop (GM)
api.rollDay({ climate: "desert", season: "summer" });   // roll a day's weather without saving it
api.climates;                     // the climates and their numbers
api.conditions;                   // every kind of weather, with its icon and map effect
api.season;                       // {season, progress, source}: the season now
api.isOutdoors(canvas.scene);     // do the weather's rules apply on this scene?
api.activeRules(canvas.scene);    // the rules reminder ids that apply there now
api.rollModifiers(canvas.scene);  // {perception: [{id, sense, reason}], rangedWeaponAttack: [{id, reason}]}
```

## Checks

`node tests/generator.test.mjs` rolls thousands of days for every climate and season and checks that they're sensible: averages near the climate's numbers, no rain in an arctic winter, desert heat, a wet season in the tropics, fog only in still air, wet spells and warm spells that last, seasons blending without a jump, the rules reminders, and the temperature through the day (no jump at midnight).
`node tests/seasons.test.mjs` checks reading the season from Foundry's Gregorian calendar and dnd5e's Harptos and Khorvaire calendars, including winters that wrap the new year, and calendars without seasons.
`node tests/ledger.test.mjs` checks the day-by-day record: the forecast becoming today's weather, jumping ahead, going back in time, rolling again, weather set by hand, a new climate, and old days being dropped.
`node tests/foundry.test.mjs` runs the module in a small stand-in for Foundry: the GM's client rolling the weather on as the clock moves, what the GM and players see in the bar, announcements, the weather window, the weather on the map, and turning automatic rolling off. It also checks that every piece of text is in `lang/en.json`.

## Made with AI

This module was built with Claude, an AI model made by Anthropic. Pwykersotz decides what it should do, tests it in play and approves each release. Claude wrote the code, the tests and this README from those requests.

That means it has had real use at one table but no line-by-line review by a second person. Back up your world before you update, and report anything that looks wrong.
