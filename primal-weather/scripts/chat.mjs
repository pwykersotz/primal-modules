/**
 * Weather in chat: posted from the GM's menu, or announced when the weather changes (if the setting is on).
 */
import { MODULE_ID, SETTINGS, loc, setting } from "./constants.mjs";
import { chatContent } from "./display.mjs";
import { getWeather } from "./weather.mjs";

/**
 * Post a day's weather to chat.
 * @param {object} [options]
 * @param {object} [options.weather]    By default, the weather now.
 * @param {boolean} [options.whisper]   Whisper it to the GMs only.
 */
export async function postWeather({ weather, whisper=false }={}) {
  weather ??= getWeather()?.weather;
  if ( !weather ) return null;
  try {
    return await ChatMessage.implementation.create({
      content: chatContent(weather, setting(SETTINGS.units)),
      speaker: { alias: loc("Chat.Speaker") },
      whisper: whisper ? game.users.filter(u => u.isGM).map(u => u.id) : []
    });
  } catch(err) {
    console.error(`${MODULE_ID} | Could not post the weather to chat`, err);
    return null;
  }
}

/**
 * Announce new weather, as the "Announce new weather in chat" setting says.
 * @param {object} weather
 */
export function announce(weather) {
  const mode = setting(SETTINGS.announce);
  if ( !weather || (mode === "off") ) return null;
  return postWeather({ weather, whisper: mode === "gm" });
}
