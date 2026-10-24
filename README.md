# HCC2D JavaScript Encoder 0.9.0

[![CI](https://github.com/marco-querini/hcc2d-cli-javascript-encoder/actions/workflows/ci.yml/badge.svg)](https://github.com/marco-querini/hcc2d-cli-javascript-encoder/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/hcc2d-encoder.svg)](https://www.npmjs.com/package/hcc2d-encoder)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Written by Marco Querini.

Pure JavaScript reference encoder for standard QR Code, HCC2D4, and HCC2D8.
It provides both an importable ES module API and the `hcc2d-encoder` command.
The encoding algorithm is an independent JavaScript implementation: it does
not invoke the C or Python encoders and does not use WebAssembly or native npm
add-ons.

## Official links

- HCC2D website: <https://hcc2d.com/en/>
- HCC2D Code Specification 0.9.0: <https://doi.org/10.5281/zenodo.22206528>
- HCC2D API: <https://hcc2d.com/en/api>
- Source: <https://github.com/marco-querini/hcc2d-cli-javascript-encoder>
- npm package: <https://www.npmjs.com/package/hcc2d-encoder>
- C reference encoder: <https://github.com/marco-querini/hcc2d-cli-c-encoder>
- Python reference encoder: <https://github.com/marco-querini/hcc2d-cli-python-encoder>
- Client-side WebAssembly encoder: <https://marco-querini.github.io/hcc2d-web-encoder/>
- HCC2D Decoder:
  - Google Play: <https://play.google.com/store/apps/details?id=com.hcc2d.decoder>
  - Huawei AppGallery: <https://appgallery.cloud.huawei.com/marketshare/app/C117478101>
  - App Store: <https://apps.apple.com/app/id6762202762>
- HCC2D Encoder on the Mac App Store: <https://apps.apple.com/app/id6767833986>

## Supported features

- standard black/white QR Code
- HCC2D4 with 4 colours and 2 bits per data module
- HCC2D8 with 8 colours and 3 bits per data module
- error-correction levels `L`, `M`, `Q`, and `H`
- versions `1..40`, or automatic selection
- screen-oriented Model 1 and print-oriented Model 2 palettes
- custom palettes through the JavaScript API, with normative black/white anchors
- raw payloads and optional HCC2DF file wrapping
- indexed PNG output
- importable modern ECMAScript module (ESM) API
- command-line interface for text and binary files
- no npm runtime dependencies

HCC2D16 is not included because it is not part of HCC2D Code Specification
0.9.0 or the public C and Python reference encoders 0.9.0.

## Requirements

- Node.js 22 or later
- npm 10 or later for installation and package management

Continuous integration covers the supported Node.js 22 and 24 LTS lines and
Node.js 26 Current. Development and release automation use npm 12.2.1.

The package uses only Node.js standard-library modules. There are no runtime
dependencies, native npm add-ons, post-install scripts, downloads, or
telemetry.

## Installation

Install into a project:

```bash
npm install hcc2d-encoder
```

Install the CLI globally:

```bash
npm install --global hcc2d-encoder
hcc2d-encoder --help
```

Run the CLI without a permanent global installation:

```bash
npx hcc2d-encoder --help
```

Before the first npm release, install from a local clone:

```bash
npm install
npm link
hcc2d-encoder --help
```

## JavaScript API

### Generate an HCC2D4 PNG

```javascript
import { encodeHcc2d, writePng } from "hcc2d-encoder";

const payload = new TextEncoder().encode("hello");
const symbol = encodeHcc2d(payload, {
  mode: "hcc2d4",
  ecLevel: "Q",
  version: 0,
  scale: 12,
  quietZone: 4,
});

writePng("hello.png", symbol);
```

### Generate an HCC2D8 PNG in memory

```javascript
import { PALETTE_8_MODEL2, encodeHcc2d } from "hcc2d-encoder";

const symbol = encodeHcc2d(Buffer.from("Batch=2026-06-16;Unit=004271"), {
  mode: "hcc2d8",
  palette: PALETTE_8_MODEL2,
});

const png = symbol.toPng(); // Node.js Buffer
```

### Generate a standard QR Code

```javascript
import { encodeQr } from "hcc2d-encoder";

const symbol = encodeQr(Buffer.from("https://hcc2d.com/"), {
  ecLevel: "Q",
});
const png = symbol.toPng();
```

### Wrap a file in HCC2DF

```javascript
import { readFileSync } from "node:fs";
import { buildHcc2dfPayload, encodeHcc2d } from "hcc2d-encoder";

const wrapped = buildHcc2dfPayload("report.pdf", readFileSync("report.pdf"));
const symbol = encodeHcc2d(wrapped, { mode: "hcc2d8", ecLevel: "L" });
```

The encoding functions accept `Buffer`, `Uint8Array`, or `ArrayBuffer`. They
return an `EncodedSymbol` with these public properties:

- `mode`
- `ecLevel`
- `version`
- `innerDimension`
- `fullDimension`
- `maskPattern`
- `palette`
- `pixels`
- `width`
- `height`

Call `symbol.toPng()` to obtain PNG bytes or `writePng(path, symbol)` to write
the PNG directly.

## Command-line usage

Show the complete help and legal notice:

```bash
hcc2d-encoder --help
```

Generate a standard QR Code containing raw UTF-8 text:

```bash
hcc2d-encoder --text "https://hcc2d.com/spec" \
  --mode qr --file-format raw qr-spec-url.png
```

Generate an HCC2D4 symbol containing raw text bytes:

```bash
hcc2d-encoder --text "Batch=2026-06-16;Line=A3;Unit=004271" \
  --mode hcc2d4 --file-format raw hcc2d4-label.png
```

Generate an HCC2D8 symbol carrying a file in an HCC2DF container:

```bash
hcc2d-encoder --input-file report.pdf --mode hcc2d8 \
  --file-format hcc2df --ec-level L hcc2d8-report.png
```

Defaults are HCC2D4, EC level Q, automatic version selection, 12 pixels per
module, a 4-module quiet zone, Model 1 palette, and HCC2DF wrapping.

### Raw versus HCC2DF

Use `raw` when the bytes are already the complete payload and filename
metadata is unnecessary. This minimizes overhead.

Use `hcc2df` for file-oriented payloads. It preserves the basename and applies
zlib compression only when the content is at least 128 bytes and the compressed
representation is strictly smaller than 90% of the original size.

## Compatibility and validation

The JavaScript implementation is validated against both public reference
encoders. The forced-version matrix covers:

- all versions from 1 through 40
- QR, HCC2D4, and HCC2D8
- EC levels L, M, Q, and H
- Model 1 and Model 2 where applicable
- 800 structural combinations using a minimal payload

For every case, the comparison verifies identical PNG dimensions, palette
entries, and decompressed indexed pixels across JavaScript, C, and Python.
Compressed IDAT bytes are intentionally not required to match because different
zlib versions can produce different lossless streams for identical pixels.

An additional 42 binary-payload cases verify automatic version selection,
multi-block symbols, and the exact capacity boundary at representative
versions 1, 10, 27, and 40. Twelve corresponding overflow cases verify that
all three encoders reject the first byte beyond the supported capacity. The
complete reference suite therefore compares 842 generated PNGs and 12 exact
rejection boundaries.

Run the normal test suite:

```bash
npm test
```

When sibling clones of the C and Python repositories are available, run the
full cross-implementation comparison:

```bash
npm run test:reference
```

Override their locations when required:

```bash
HCC2D_C_REFERENCE_DIR=/path/to/hcc2d-cli-c-encoder \
HCC2D_PYTHON_REFERENCE_DIR=/path/to/hcc2d-cli-python-encoder \
npm run test:reference
```

GitHub Actions tests Node.js 22, 24, and 26. A separate packaging job
builds the exact npm tarball, installs it into a clean project, invokes its
published CLI entry point, and verifies a generated PNG.

## Architecture and independence

The JavaScript implementation independently performs:

1. byte-mode framing and capacity selection;
2. Reed-Solomon error-correction generation and interleaving;
3. QR-compatible function-pattern and data-module placement;
4. mask selection;
5. HCC2D plane construction and Color Palette Pattern rendering;
6. indexed raster generation and PNG serialization;
7. optional HCC2DF filename wrapping and compression.

The package does not execute the C or Python implementations. Those projects
are used only by the optional development-time reference comparison.

The current npm package targets Node.js. For a fully client-side browser build,
use the official HCC2D WebAssembly encoder linked above; it runs locally in a
Web Worker and does not upload payloads.

## Building and inspecting the npm package

```bash
npm ci
npm run check
npm pack
npm install --global ./hcc2d-encoder-0.9.0.tgz
```

`npm pack --dry-run` shows every file that would be published. The `files`
allow-list in `package.json` prevents tests, workflows, local output, and
development scripts from entering the production package.

## Security and privacy

Encoding is local. The package contains no network requests, analytics,
advertising, dynamic code downloads, installation hooks, or credential access.
Input data is read only when explicitly supplied through the API or CLI.

See [SECURITY.md](SECURITY.md) for responsible vulnerability reporting.

## Publication

npm releases are immutable. Production publication is performed from a tagged
GitHub release using npm Trusted Publishing with short-lived OIDC credentials.
No long-lived npm token is stored in the repository. See
[PUBLISHING.md](PUBLISHING.md) for the complete release checklist.

## License and warranty

Copyright 2010-2026 Marco Querini.

SPDX-License-Identifier: Apache-2.0. See [LICENSE](LICENSE).

This software is provided "as is", without warranties or conditions of any
kind. Use is entirely at your own risk. The author assumes no responsibility
for unreadable or non-decodable codes, failed scans, data loss, or other
consequences arising from its use.

## Notice

The views expressed in connection with the HCC2D Code Specification, HCC2D
applications, and HCC2D source code are solely those of the author and do not
necessarily reflect the official position of any institution, organization,
or employer with which the author is or has been affiliated.
