/**
 * The climates the generator knows, and how each season behaves in them.
 *
 * For each season:
 * - high:   the average daily high, in °F.
 * - spread: how far a day's high typically strays from that average (°F). Warm and cold spells come and go over a
 *           few days rather than jumping about.
 * - range:  the usual drop from the day's high to the night's low (°F). Clear skies widen it, cloud narrows it.
 * - sky:    how often each kind of sky comes up (relative weights). Rain and snow are one scale (light, moderate,
 *           heavy, storm); whether they fall as rain, sleet or snow depends on the temperature.
 * - wind:   relative weights for calm, light, moderate, strong and gale.
 *
 * The numbers describe the middle of each season. Between the middles the generator blends one season into the
 * next, so spring warms up a little each day instead of all at once.
 */

/** In the order they follow each other. */
export const SEASONS = ["spring", "summer", "autumn", "winter"];

/** Kinds of sky, from fair to foul. Rain and snow share the steps from "light" on. */
export const SKY_SCALE = ["clear", "partly", "overcast", "light", "moderate", "heavy", "storm"];

/** Kinds of sky that aren't on the fair-to-foul scale. */
export const SKY_SPECIAL = ["fog", "dust"];

export const SKY = [...SKY_SCALE, ...SKY_SPECIAL];

/** Wind strengths, weakest first. */
export const WIND = ["calm", "light", "moderate", "strong", "gale"];

const season = (high, spread, range, sky, wind) => ({ high, spread, range, sky: { dust: 0, ...sky }, wind });

export const CLIMATES = {
  // Four distinct seasons, rain all year, snow in winter. Most of Europe, the Sword Coast, the Flanaess.
  temperate: {
    icon: "fa-solid fa-tree",
    seasons: {
      spring: season(60, 10, 18,
        { clear: 20, partly: 24, overcast: 16, fog: 6, light: 14, moderate: 12, heavy: 4, storm: 4 },
        [15, 35, 32, 14, 4]),
      summer: season(78, 8, 20,
        { clear: 34, partly: 26, overcast: 8, fog: 3, light: 8, moderate: 8, heavy: 4, storm: 9 },
        [25, 40, 25, 8, 2]),
      autumn: season(58, 10, 16,
        { clear: 20, partly: 22, overcast: 20, fog: 10, light: 12, moderate: 10, heavy: 4, storm: 2 },
        [15, 30, 32, 17, 6]),
      winter: season(38, 10, 14,
        { clear: 18, partly: 18, overcast: 24, fog: 8, light: 12, moderate: 12, heavy: 5, storm: 3 },
        [15, 35, 30, 15, 5])
    }
  },

  // Mild all year: cool summers, soft winters, lots of fog, cloud and wind off the sea.
  coastal: {
    icon: "fa-solid fa-water",
    seasons: {
      spring: season(56, 6, 11,
        { clear: 18, partly: 24, overcast: 18, fog: 14, light: 12, moderate: 9, heavy: 3, storm: 2 },
        [8, 30, 35, 20, 7]),
      summer: season(70, 5, 12,
        { clear: 30, partly: 28, overcast: 10, fog: 14, light: 7, moderate: 5, heavy: 2, storm: 4 },
        [10, 35, 35, 15, 5]),
      autumn: season(60, 6, 10,
        { clear: 16, partly: 20, overcast: 20, fog: 12, light: 12, moderate: 11, heavy: 5, storm: 4 },
        [5, 25, 35, 25, 10]),
      winter: season(46, 6, 9,
        { clear: 12, partly: 18, overcast: 26, fog: 10, light: 14, moderate: 12, heavy: 5, storm: 3 },
        [5, 25, 35, 25, 10])
    }
  },

  // High country: cold nights, windy, snow much of the year, sudden summer storms.
  mountain: {
    icon: "fa-solid fa-mountain",
    seasons: {
      spring: season(42, 10, 20,
        { clear: 22, partly: 20, overcast: 16, fog: 8, light: 12, moderate: 12, heavy: 5, storm: 5 },
        [10, 25, 32, 24, 9]),
      summer: season(64, 8, 24,
        { clear: 32, partly: 24, overcast: 8, fog: 6, light: 8, moderate: 8, heavy: 4, storm: 10 },
        [12, 30, 32, 20, 6]),
      autumn: season(46, 10, 20,
        { clear: 24, partly: 20, overcast: 16, fog: 8, light: 12, moderate: 10, heavy: 6, storm: 4 },
        [8, 24, 32, 26, 10]),
      winter: season(25, 10, 16,
        { clear: 22, partly: 16, overcast: 20, fog: 6, light: 12, moderate: 12, heavy: 7, storm: 5 },
        [8, 22, 30, 28, 12])
    }
  },

  // Tundra and ice: bitter, dangerous winters and a short, cool summer.
  arctic: {
    icon: "fa-solid fa-icicles",
    seasons: {
      spring: season(14, 10, 14,
        { clear: 26, partly: 20, overcast: 18, fog: 6, light: 14, moderate: 9, heavy: 4, storm: 3 },
        [10, 25, 30, 25, 10]),
      summer: season(46, 8, 14,
        { clear: 22, partly: 24, overcast: 22, fog: 10, light: 12, moderate: 7, heavy: 2, storm: 1 },
        [12, 30, 32, 20, 6]),
      autumn: season(20, 10, 12,
        { clear: 20, partly: 18, overcast: 24, fog: 6, light: 14, moderate: 10, heavy: 5, storm: 3 },
        [8, 22, 30, 28, 12]),
      winter: season(-8, 12, 12,
        { clear: 30, partly: 18, overcast: 18, fog: 4, light: 14, moderate: 8, heavy: 4, storm: 4 },
        [10, 22, 28, 26, 14])
    }
  },

  // Hot, dry days and cold nights. Rain is rare and sudden; dust storms are not.
  desert: {
    icon: "fa-solid fa-sun-plant-wilt",
    seasons: {
      spring: season(84, 8, 32,
        { clear: 52, partly: 18, overcast: 4, fog: 0, light: 3, moderate: 2, heavy: 1, storm: 2, dust: 10 },
        [20, 30, 28, 17, 5]),
      summer: season(104, 6, 30,
        { clear: 62, partly: 16, overcast: 3, fog: 0, light: 2, moderate: 2, heavy: 1, storm: 4, dust: 10 },
        [25, 35, 25, 12, 3]),
      autumn: season(86, 8, 30,
        { clear: 58, partly: 18, overcast: 6, fog: 0, light: 4, moderate: 3, heavy: 1, storm: 2, dust: 7 },
        [25, 35, 25, 12, 3]),
      winter: season(66, 8, 30,
        { clear: 56, partly: 20, overcast: 8, fog: 1, light: 6, moderate: 3, heavy: 1, storm: 1, dust: 4 },
        [25, 35, 25, 12, 3])
    }
  },

  // Hot and humid all year. Summer is the wet season (downpours and thunderstorms), winter the dry season.
  tropical: {
    icon: "fa-solid fa-umbrella-beach",
    seasons: {
      spring: season(88, 4, 14,
        { clear: 30, partly: 28, overcast: 10, fog: 3, light: 10, moderate: 8, heavy: 4, storm: 7 },
        [25, 40, 25, 8, 2]),
      summer: season(86, 3, 12,
        { clear: 12, partly: 20, overcast: 12, fog: 4, light: 12, moderate: 14, heavy: 12, storm: 14 },
        [20, 35, 28, 12, 5]),
      autumn: season(86, 4, 12,
        { clear: 18, partly: 24, overcast: 12, fog: 4, light: 12, moderate: 12, heavy: 8, storm: 10 },
        [20, 35, 28, 12, 5]),
      winter: season(84, 4, 14,
        { clear: 40, partly: 30, overcast: 8, fog: 4, light: 8, moderate: 5, heavy: 2, storm: 3 },
        [25, 40, 25, 8, 2])
    }
  }
};

export const DEFAULT_CLIMATE = "temperate";
