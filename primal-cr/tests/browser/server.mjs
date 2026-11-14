/**
 * A small static server for the browser checks. It serves:
 *   /modules/primal-cr/*   this module
 *   /harness/*             tests/browser
 *   /systems/dnd5e/*       the dnd5e system        (DND5E: its folder, with dnd5e.mjs, lang/en.json, system.json)
 *   /data/*                actors to test with     (ACTOR_DATA: a folder of JSON files, see tests/README.md)
 *   /lib/*                 Foundry's libraries     (FOUNDRY_APP/node_modules)
 *   everything else        Foundry's public folder (FOUNDRY_APP/public)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = path.resolve(here, "../..");
export const FOUNDRY_APP = process.env.FOUNDRY_APP ?? "/mnt/user-data/uploads/app";
export const DND5E = process.env.DND5E ?? "/mnt/user-data/uploads/FoundryVTT/Data/systems/dnd5e";
export const ACTOR_DATA = process.env.ACTOR_DATA ?? path.join(here, "../fixtures");

const TYPES = {
  ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".hbs": "text/plain", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".png": "image/png", ".woff2": "font/woff2"
};

function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split("?")[0]);
  const map = [
    ["/modules/primal-cr/", MODULE_ROOT],
    ["/harness/", here],
    ["/systems/dnd5e/", DND5E],
    ["/data/", ACTOR_DATA],
    ["/lib/", path.join(FOUNDRY_APP, "node_modules")]
  ];
  for ( const [prefix, root] of map ) {
    if ( p.startsWith(prefix) ) return path.join(root, p.slice(prefix.length));
  }
  return path.join(FOUNDRY_APP, "public", p);
}

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const page = (req.url === "/") || req.url.startsWith("/game");
    const file = page ? path.join(here, "harness.html") : resolve(req.url);
    fs.readFile(file, (err, data) => {
      if ( err ) {
        res.writeHead(404);
        return res.end(`Not found: ${req.url}`);
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise(r => server.listen(port, "127.0.0.1", () => r(server)));
}
