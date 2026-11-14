import { getSetting } from "./utilities.js";
import { MODULE_ID, LEGACY_ID } from "./constants.js";

/**
 * @typedef FlagDetails
 * @property {typeof Object} type     - The data type of the flag/setting
 * @property {any}           default  - The default value of the flag  
 * @property {Boolean}       hidden   - True if this flag should not be a configurable setting
 * @property {string}       [setting] - Optionally specify an alternative name for this flag's setting
 */

export default class Flags {
	static get scope() { return MODULE_ID; }

	/** The module's id before it was renamed, which older flags are saved under. */
	static get legacyScope() { return LEGACY_ID; }

	/**
	 * A document's own flag values. Values saved under the module's old id are used until the
	 * document's flags are next changed, when they are copied over.
	 *
	 * @param {Document} doc
	 * @return {object}
	 */
	static stored(doc) {
		const flags = doc?.flags ?? {};
		const current = flags[this.scope] ?? {};
		const legacy = flags[this.legacyScope];
		if (!legacy || current.migrated) return current;
		return { ...legacy, ...current };
	}

	/**
	 * Update data that copies a document's flags from the module's old id to its new one, if that
	 * hasn't been done yet.
	 *
	 * @param {Document} doc
	 * @return {object}
	 */
	static migrationUpdate(doc) {
		const legacy = doc?.flags?.[this.legacyScope];
		const current = doc?.flags?.[this.scope] ?? {};
		if (!legacy || current.migrated) return {};
		const update = { [`flags.${this.scope}.migrated`]: true };
		for (const [name, value] of Object.entries(legacy)) {
			if (!(name in current)) update[`flags.${this.scope}.${name}`] = value;
		}
		return update;
	}

	/**
	 * The details of each flag/setting 
	 *
	 * @type {Object<string, FlagDetails>}
	 * @readonly
	 * @static
	 * @memberof Flags
	 */
	static get flagDefaults() {
		return {
			"inline-secrets"    : { type: Boolean, default: false },
			"hidden-secrets"    : { type: Boolean, default: false },
			"hide-profile-image": { type: Boolean, default: false },
			"use-token-image"   : { type: Boolean, default: false },
			"theme-choice"      : { type: String , default: "modern" , hidden: true, setting: "default-theme" },
			"custom-theme-class": { type: String , default: ""    },
			"editing"           : { type: Boolean, default: true  },
			"compact-window"    : { type: Boolean, default: false },
			"compact-feats"     : { type: Boolean, default: false },
			"compact-layout"    : { type: Boolean, default: false },
			"show-collapsible"  : { type: Boolean, default: false },
			"show-delete"       : { type: Boolean, default: false  , hidden: true  },
			"font-size"         : { type: Number , default: 14    },
			"scale"             : { type: Number , default: 1      , hidden: true  },
			"collapsed"         : { type: Object,  default: {}     , hidden: true  }
		}
	}

	/**
	 * Returns an object of all the flag keys with their settings as configured in the module
	 * settings menu.
	 *
	 * @memberof Flags
	 */
	static get defaultFlags() {
		return Object.fromEntries(
			Object.entries(this.flagDefaults).map(([name, details]) => [name, foundry.utils.deepClone(
				getSetting(this.scope, details.setting || name)
				?? details.default
			)])
		);
	}

	/**
	 * The value a flag has when a monster hasn't chosen its own: the game setting, or the built-in default.
	 *
	 * @param {string} flag
	 * @return {any}
	 */
	static initialValue(flag) {
		const setName = this.flagDefaults[flag]?.setting || flag;                    // The name of the setting containing this flag's default
		const hidden  = this.flagDefaults[flag]?.hidden && setName == flag;          // Hidden means there is no setting registered unless there is an alternate setting name
		const setting = hidden ? undefined : getSetting(this.scope, setName);        // The value of the setting, undedfined if hidden
		const def     = this.flagDefaults[flag]?.default;                            // The default or configured default value of this flag
		return setting ?? def;                                                       // The starting value of this flag if not defined on the actor
	}

	static getFlag(flags, flag) {
		if (!(flag in this.flagDefaults)) return undefined;

		const initial = this.initialValue(flag);

		if (flags.actor.compendium) return initial;                                  // If the actor is in a compendium, just use initial

		return this.stored(flags.actor)[flag] ?? initial;                            // Return the stored flag value, or initial
	}

	static setFlag(flags, flag, value) {
		if (!(flag in flags.constructor.flagDefaults)) return;
		if (flags.actor.compendium) return;

		// Choosing the same value as the game setting removes this monster's own choice, so it follows
		// the game settings again (and later changes to them) instead of staying pinned to the old value.
		const actor = flags.actor;
		const initial = this.initialValue(flag);
		const stored = this.stored(actor)[flag];
		const reset = value === initial && (typeof value !== "object" || value === null);

		// The first change after the module was renamed carries this monster's other choices over too.
		const migration = this.migrationUpdate(actor);
		delete migration[`flags.${this.scope}.${flag}`];
		if (Object.keys(migration).length) {
			if (reset && stored === undefined) return;
			if (!reset) migration[`flags.${this.scope}.${flag}`] = value;
			return actor.update(migration);
		}

		if (reset) {
			if (stored === undefined) return;
			return actor.unsetFlag(this.scope, flag);
		}
		return actor.setFlag(this.scope, flag, value);
	}

	/**
	 * Remove all of a monster's own display choices, so that it follows the game settings again.
	 *
	 * @param {Actor} actor
	 * @return {Promise|undefined}
	 */
	static clearFlags(actor) {
		if (!actor || actor.compendium) return;
		const stored = actor.flags?.[this.scope] ?? {};
		const update = {};
		for (const name of Object.keys(this.flagDefaults)) {
			if (name in stored) update[`flags.${this.scope}.-=${name}`] = null;
		}
		// Choices saved under the module's old id stop applying too.
		if (actor.flags?.[this.legacyScope] && !stored.migrated) update[`flags.${this.scope}.migrated`] = true;
		if (!Object.keys(update).length) return;
		return actor.update(update);
	}

	/**
	 * Creates an instance of Flags.
	 *
	 * @param {MonsterBlock5e} sheet
	 * @memberof Flags
	 */
	constructor(sheet) {
		this.sheet = sheet;
		this.actor = sheet.actor;

		this.flags = new Proxy(this, {
			get: this.constructor.getFlag.bind(this.constructor),
			set: (flags, flag, value) => {
				this.constructor.setFlag(flags, flag, value);
				return true;
			}
		});
	}

	/**
	 * 
	 *
	 * @memberof Flags
	 */
	*allFlags() {
		for (let [name, details] of Object.entries(this.constructor.flagDefaults)) {
			yield { name, ...details, value: this.flags[name] }
		}
	}
}