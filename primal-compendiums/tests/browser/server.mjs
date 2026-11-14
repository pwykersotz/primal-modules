/**
 * A small static server for the browser checks. It serves:
 *   /modules/primal-compendiums/*  this module
 *   /harness/*                     tests/browser
 *   /templates/*                   Foundry's templates          (FOUNDRY_APP/templates)
 *   /lib/*                         Foundry's bundled libraries  (FOUNDRY_APP/node_modules)
 *   everything else                Foundry's public folder      (FOUNDRY_APP/public)
 *
 * FOUNDRY_APP is a copy of (parts of) Foundry's "resources/app" folder; see tests/README.md for the files needed.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = path.resolve(here, "../..");
export const FOUNDRY_APP = process.env.FOUNDRY_APP ?? "/mnt/user-data/uploads/app";

const TYPES = {
  ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".hbs": "text/plain", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".png": "image/png", ".woff2": "font/woff2"
};

function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split("?")[0]);
  const map = [
    ["/modules/primal-compendiums/", MODULE_ROOT],
    ["/harness/", here],
    ["/templates/", path.join(FOUNDRY_APP, "templates")],
    ["/lib/", path.join(FOUNDRY_APP, "node_modules")]
  ];
  for ( const [prefix, root] of map ) {
    if ( p.startsWith(prefix) ) return path.join(root, p.slice(prefix.length));
  }
  return path.join(FOUNDRY_APP, "public", p);
}

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    // The page lives at /game, as Foundry's does, so relative image paths resolve the same way.
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
