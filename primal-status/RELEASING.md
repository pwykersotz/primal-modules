# Sharing Primal Status

In the primal-modules repository, releases are made for you: see `../RELEASING.md`. This file describes
releasing Primal Status from a repository of its own.

Foundry installs a module from a **manifest link**: a URL to its `module.json`, which in turn says
where to download the zip. The simplest free place to host both is a GitHub repository with
releases. Everything below can be done from the GitHub website; nothing here needs a server.

## Before the first release
1. In `module.json`, replace the author `"You"` with your name (and optionally `"url"` or `"discord"`
   fields inside the author entry).
2. Choose a licence and add it as `LICENSE` at the top of the repository (the packaging script puts
   it in the zip). Without one, others may install the module but have no permission to change or
   redistribute it.
3. The module's ID is `primal-status` (its folder must have the same name). Worlds that used
   the earlier `enhanced-status-effects` or `mighty-guard` folder carry their settings over on the first
   load (see the README).
4. Create a GitHub repository and push this folder to it (the `.gitignore` already leaves out
   `node_modules/`, `dist/` and test output).

## Making a release
A GitHub workflow does this for you. It lives at `.github/workflows/release.yml`; if your copy of the
module folder doesn't have it, add the file at that path in the repository (GitHub's *Add file* button
works). Then, on GitHub, open **Releases → Draft a new release**, create
the tag `v` + the version in `module.json` (for example `v2.36.0`), and publish. The workflow
checks the tag matches, builds `module.json` and `module.zip` with
the right links, and attaches both to the release.

To do it by hand instead:

    node tools/build.mjs                         # if you changed anything in src/
    bash tests/run-all.sh                        # every automated check
    node tools/package.mjs --repo OWNER/REPO     # writes dist/module.json and dist/module.zip

Then create a release tagged `v<version>` and attach `dist/module.json` and `dist/module.zip`.

## Installing it (for other people)
In Foundry: **Add-on Modules → Install Module**, paste this into *Manifest URL* and click Install:

    https://github.com/OWNER/REPO/releases/latest/download/module.json

Foundry then offers updates whenever a newer release is published. To install one release by hand,
unzip `module.zip` into `Data/modules/primal-status/`.

## Listing it on foundryvtt.com
Optional. Sign in on foundryvtt.com, go to your account's *Packages* page and submit a new package
with the manifest URL above. The package ID must be unique on the site; if `primal-status` is taken
you would need a new ID, which existing worlds would see as a different module.

## Each new version
1. Raise `version` in `module.json` and add a section to `CHANGELOG.md`.
2. Build, run the checks, commit and push.
3. Publish a release tagged with the new version.
