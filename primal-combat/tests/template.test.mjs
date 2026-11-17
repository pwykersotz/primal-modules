/**
 * Checks that the carousel template always renders exactly one root element, run with
 * `node tests/template.test.mjs`. Foundry's HandlebarsApplicationMixin refuses a part that renders none or several
 * ("Template part 'carousel' must render a single HTML element"), so nothing at the top level may be conditional.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** The top-level elements of a template, and any block helpers that sit outside them. */
function topLevel(source) {
  const token = /<!--[\s\S]*?-->|\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}|<\/?([a-zA-Z][\w-]*)[^>]*>|\{\{(#|\^|\/|else\b)[^}]*\}\}/g;
  const roots = [];
  const blocks = [];
  let depth = 0;
  for ( const m of source.matchAll(token) ) {
    const [text, tag, helper] = m;
    if ( helper ) {
      if ( depth === 0 ) blocks.push(text);
      continue;
    }
    if ( !tag ) continue;
    const name = tag.toLowerCase();
    if ( text.startsWith("</") ) depth--;
    else {
      if ( depth === 0 ) roots.push(name);
      if ( !VOID.has(name) && !text.endsWith("/>") ) depth++;
    }
  }
  assert.equal(depth, 0, "tags are balanced");
  return { roots, blocks };
}

const source = readFileSync(new URL("../templates/carousel.hbs", import.meta.url), "utf8");
const { roots, blocks } = topLevel(source);
assert.deepEqual(roots, ["div"], "one root element");
assert.deepEqual(blocks, [], "no block helper around the root element");

// The checker itself: a root that only renders sometimes is caught.
assert.ok(topLevel("{{#if visible}}\n<div></div>\n{{/if}}").blocks.length > 0);
assert.equal(topLevel("<div></div><div></div>").roots.length, 2);

console.log("template: ok");
