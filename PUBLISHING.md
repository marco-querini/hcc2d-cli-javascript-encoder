# npm publication procedure

This repository builds the public `hcc2d-encoder` npm package. npm package
versions are immutable: never publish a test build using a version intended
for a later production release.

## Accounts and repository setup

1. Create an account at <https://www.npmjs.com/signup>.
2. Verify the email address, enable two-factor authentication, and store the
   recovery codes securely.
3. Create the public GitHub repository
   `marco-querini/hcc2d-cli-javascript-encoder`.
4. Push only the reviewed source and confirm GitHub CI passes.
5. Create a protected GitHub environment named `npm`; requiring manual
   approval is strongly recommended.
6. Confirm that `hcc2d-encoder` is still available immediately before the
   first publication.

## First publication and Trusted Publishing

Trusted Publisher settings belong to an existing npm package. For the initial
release, publish the reviewed package once using a narrowly scoped npm token
from the GitHub release workflow, with provenance enabled. Immediately after
the package exists:

1. open the package settings on npmjs.com;
2. add a GitHub Actions Trusted Publisher;
3. configure owner `marco-querini`;
4. configure repository `hcc2d-cli-javascript-encoder`;
5. configure workflow `release.yml`;
6. configure environment `npm`;
7. allow direct `npm publish` only;
8. remove `NPM_TOKEN` from GitHub and revoke the bootstrap token;
9. require 2FA and disallow token-based publishing in the package settings.

Trusted Publishing requires npm 11.5.1 or later and Node.js 22.14.0 or later.
The release workflow installs the current npm CLI on Node.js 24 and requests
only `contents: read` and `id-token: write` permissions.

Official references:

- <https://docs.npmjs.com/trusted-publishers/>
- <https://docs.npmjs.com/generating-provenance-statements/>

## Pre-release checks

1. Work from an exact clean, reviewed commit.
2. Confirm the version agrees in `package.json`, `package-lock.json`,
   `src/index.js`, the changelog, and the source header.
3. Confirm there are no credentials, generated PNG files, tarballs,
   `node_modules`, coverage output, or local build artifacts tracked.
4. Run `npm ci` and `npm test`.
5. Run `npm run test:reference` against clean C and Python reference clones.
6. Run `npm pack --dry-run` and inspect the complete allow-listed manifest.
7. Build the tarball with `npm pack` and install it into an empty project.
8. Generate at least one QR, HCC2D4, and HCC2D8 image through the installed
   CLI and one through the imported API.
9. Confirm the package name immediately before the first publication.

## Local package validation

```bash
npm ci
npm test
npm run test:reference
npm pack --dry-run
npm pack
```

Install without consulting the registry:

```bash
validation_dir="$(mktemp -d)"
cd "$validation_dir"
npm init -y
npm install /path/to/hcc2d-encoder-0.9.0.tgz
./node_modules/.bin/hcc2d-encoder --text "release validation" \
  --mode hcc2d8 --file-format raw output.png
test -s output.png
```

## Production release

1. Commit and push the exact reviewed source.
2. Wait for every CI job to pass.
3. Create an annotated tag such as `v0.9.0` from that commit.
4. Create a GitHub release from the tag.
5. Publishing the release triggers `.github/workflows/release.yml`.
6. Approve the protected `npm` environment after reviewing the commit and tag.
7. Verify the npm package page, provenance statement, repository link,
   README rendering, file list, and integrity hash.
8. Install from npm into a new empty project and repeat the CLI/API smoke tests.
9. Run `npm audit signatures` in the clean consumer project.

Never place an npm token in this repository, an `.npmrc`, shell history, a
command-line argument, or a committed workflow file.

## Versioning and emergency handling

- Follow semantic versioning.
- npm does not permit replacing the contents of an existing version.
- If a release is incorrect, deprecate it with an explanation and publish a
  corrected patch version.
- Unpublishing should be reserved for genuine security or legal emergencies
  and must follow npm policy.
- If credentials might have been exposed, revoke them before investigating
  anything else and rotate all affected access.
