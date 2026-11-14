/* -------------------------------------------- */
/*  Wrapping helper (uses libWrapper if active) */
/* -------------------------------------------- */

/** Wrap a property getter (libWrapper if active, otherwise by redefining the property). */
function wrapGetter(path, fn) {
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    try { libWrapper.register(MODULE_ID, path, fn, "WRAPPER"); return; }
    catch (err) { console.warn(`${MODULE_ID} | Could not wrap ${path}`, err); return; }
  }
  const parts = path.split(".");
  const prop = parts.pop();
  const owner = foundry.utils.getProperty(globalThis, parts.join("."));
  if (!owner) return;
  let descriptor = null;
  for (let o = owner; o && !descriptor; o = Object.getPrototypeOf(o)) descriptor = Object.getOwnPropertyDescriptor(o, prop);
  if (!descriptor?.get) return;
  const original = descriptor.get;
  Object.defineProperty(owner, prop, {
    configurable: true, enumerable: descriptor.enumerable,
    get() { return fn.call(this, original.bind(this)); },
    set: descriptor.set
  });
}

function wrap(path, fn, type = "WRAPPER") {
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    libWrapper.register(MODULE_ID, path, fn, type);
    return;
  }
  const parts = path.split(".");
  const method = parts.pop();
  const owner = foundry.utils.getProperty(globalThis, parts.join("."));
  const original = owner[method];
  owner[method] = function (...args) {
    return fn.call(this, original.bind(this), ...args);
  };
}
