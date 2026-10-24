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

Trusted Publisher settings are configured from an existing npm package. Use a
release candidate to establish the package without sacrificing provenance for
the final release:

1. set the synchronized project version to `0.9.0-rc.1`;
2. create a short-lived granular npm token with the minimum available publish
   access and store it only as the protected GitHub environment secret
   `NPM_TOKEN`;
3. create tag `v0.9.0-rc.1` and publish a GitHub prerelease; the workflow uses
   npm dist-tag `next` and publishes provenance from the public repository;
4. open the new package settings on npmjs.com and add a GitHub Actions Trusted
   Publisher with owner `marco-querini`, repository
   `hcc2d-cli-javascript-encoder`, workflow `release.yml`, environment `npm`,
   and permission for direct `npm publish`;
5. revoke the bootstrap token, delete the `NPM_TOKEN` GitHub secret, and remove
   the `NODE_AUTH_TOKEN` environment entry from `release.yml`;
6. set the synchronized project version to `0.9.0`, rerun the complete release
   validation, and publish the final GitHub release through OIDC.

A newly created Trusted Publisher configuration must complete its first
successful publication within two days. Create the configuration only when the
final release is ready, then publish `0.9.0` within that window. If the window
expires, delete the expired configuration and create a new one.

Trusted Publishing requires npm 11.5.1 or later and Node.js 22.14.0 or later.
The release workflow uses Node.js 24, installs the pinned npm CLI version, and
requests only `contents: read` and `id-token: write` permissions. GitHub Actions
and both reference encoders are pinned to immutable commit identifiers.

After the first successful OIDC publication, set npm publishing access to
"Require two-factor authentication and disallow tokens". The Trusted Publisher
continues to work with short-lived OIDC credentials.

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
5. Run `npm run test:reference` against the pinned C and Python reference
   revisions.
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
npm install /path/to/hcc2d-encoder-0.9.0-rc.1.tgz
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
