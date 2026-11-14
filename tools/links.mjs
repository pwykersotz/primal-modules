/**
 * The links Foundry uses to install and update a module from this repository: the manifest is the module.json on
 * main, and each version's zip is attached to a release tagged <module>-v<version>.
 */
export function releaseLinks(repo, id, version) {
  const base = `https://github.com/${repo}`;
  return {
    url: `${base}/tree/main/${id}`,
    manifest: `https://raw.githubusercontent.com/${repo}/main/${id}/module.json`,
    download: `${base}/releases/download/${id}-v${version}/${id}.zip`,
    bugs: `${base}/issues`,
    readme: `${base}/blob/main/${id}/README.md`,
    changelog: `${base}/blob/main/${id}/CHANGELOG.md`
  };
}
