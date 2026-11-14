# Releasing a module

Every module is released on its own, tagged `<module>-v<version>` (for example `primal-auras-v1.2.0`).

1. Raise `version` in the module's `module.json` and add a section for it at the top of its
   `CHANGELOG.md`.
2. Run `node tools/set-links.mjs`, which points the module's `download` link at the new version.
3. Run `npm test` (or `node tools/test-all.mjs <module>`).
4. Commit and push to `main`.

The **Release** workflow then sees the new version, runs that module's checks, builds it with
`tools/package.mjs`, and publishes a GitHub release with `<module>.zip` and `module.json` attached and
the changelog section as its notes. Nothing happens for modules whose version didn't change. To run it
by hand, open **Actions → Release → Run workflow**.

## Installing a release

Download `<module>.zip` from the release, and unzip it into `Data/modules/<module>/` with Foundry
closed (or replace the folder's contents and press Ctrl+F5 in the world).

Or let Foundry do it: each `module.json` on `main` carries a `manifest` link (itself) and a `download`
link (its version's zip), so **Install Module** with
`https://raw.githubusercontent.com/OWNER/REPO/main/<module>/module.json` installs it, and Foundry's
**Update** button picks up new versions. This needs the repository to be public.

## Without GitHub Actions

    node tools/package.mjs <module> --repo OWNER/REPO

writes `dist/<module>/module.json` and `dist/<module>/<module>.zip`. Create a release tagged
`<module>-v<version>` on GitHub and attach both files.
