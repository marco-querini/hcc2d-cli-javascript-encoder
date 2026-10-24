import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  PALETTE_4_MODEL1,
  PALETTE_4_MODEL2,
  PALETTE_8_MODEL1,
  PALETTE_8_MODEL2,
  buildHcc2dfPayload,
  encodeHcc2d,
  encodeQr,
  writePng,
} from "./encoder.js";

const PROGRAM_INFO = `HCC2D Encoder - pure JavaScript reference implementation
Copyright 2010-2026 Marco Querini  |  SPDX-License-Identifier: Apache-2.0  |  Version 0.9.0-rc.2

Specification compliance:
  Intended to conform to the HCC2D Code Specification version 0.9.0.
  Reference specification: https://doi.org/10.5281/zenodo.22206528

Description:
  This encoder is provided for educational purposes. It is a compact standalone
  reference implementation and is unrelated to the HCC2D Encoder and HCC2D
  Decoder desktop/mobile apps written in C/C++.

Terms of service / no-warranty notice:
  This software is provided "as is", without warranties or conditions of any
  kind, express or implied, including but not limited to merchantability,
  fitness for a particular purpose, and noninfringement. Use is entirely at
  your own risk. The author assumes no responsibility or liability for damages,
  losses, claims, unreadable or non-decodable codes, failed scans, data loss,
  or other consequences arising from its use.

Apache 2.0 summary:
  You may use, copy, modify, and redistribute this software, including for
  commercial purposes. You must retain the applicable copyright and license
  notices and state significant modifications when redistributing modified
  versions. This summary is informational only; the LICENSE file and Apache
  License 2.0 text control the legal terms.
  Full license text: https://www.apache.org/licenses/LICENSE-2.0`;

export const HELP = `Usage: hcc2d-encoder [options] output.png

${PROGRAM_INFO}

Payload source (exactly one is required):
  --text STRING          UTF-8 string to encode as the payload
  --input-file PATH      File bytes to encode

Options:
  --file-format FORMAT   Payload format: hcc2df wraps text or file bytes with
                         filename and compression metadata; raw encodes the
                         supplied bytes directly (default: hcc2df)
  --mode MODE            Symbol mode: qr = standard black/white QR Code;
                         hcc2d4 = 4 colours, 2 bits per data module; hcc2d8 =
                         8 colours, 3 bits per data module. For qr,
                         --file-format changes only the stored payload bytes
                         (default: hcc2d4)
  --ec-level LEVEL       Error-correction level: L ~ 7%, M ~ 15%, Q ~ 25%,
                         or H ~ 30% recoverable damage. Higher levels reduce
                         data capacity (default: Q)
  --version N            Symbol version 1-40. Version v has an inner grid of
                         (17+4v) x (17+4v) modules; 0 selects the smallest
                         version that fits the payload (default: 0)
  --scale PX             Pixels per module in the output PNG, 6-1000
                         (default: 12)
  --quiet-zone N         White margin outside the symbol, in modules, 0-1000
                         (default: 4)
  --palette MODEL        HCC2D palette: model1 = screen display; model2 =
                         print/CMYK; ignored for qr (default: model1)
  -h, --help             Show this help and exit
  -V, --version-info     Show the package version and exit

Examples:
  hcc2d-encoder --text "hello" --mode qr --file-format raw qr.png
  hcc2d-encoder --text "hello" --mode hcc2d4 hcc2d4.png
  hcc2d-encoder --input-file photo.jpg --mode hcc2d8 --file-format hcc2df hcc2d8.png`;

const VALUE_OPTIONS = new Set(["--text", "--input-file", "--file-format", "--mode", "--ec-level", "--version", "--scale", "--quiet-zone", "--palette"]);

export function parseArguments(argv) {
  const options = {
    text: null, inputFile: null, fileFormat: "hcc2df", mode: "hcc2d4", ecLevel: "Q",
    version: 0, scale: 12, quietZone: 4, palette: "model1", output: null,
  };
  const names = {
    "--text": "text", "--input-file": "inputFile", "--file-format": "fileFormat", "--mode": "mode",
    "--ec-level": "ecLevel", "--version": "version", "--scale": "scale", "--quiet-zone": "quietZone", "--palette": "palette",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "-V" || argument === "--version-info") return { versionInfo: true };
    if (argument.startsWith("--")) {
      if (!VALUE_OPTIONS.has(argument)) throw new RangeError(`unknown option: ${argument}`);
      if (index + 1 >= argv.length) throw new RangeError(`${argument} requires a value`);
      const key = names[argument];
      const raw = argv[++index];
      options[key] = ["version", "scale", "quietZone"].includes(key) ? Number(raw) : raw;
    } else if (options.output === null) options.output = argument;
    else throw new RangeError(`unexpected argument: ${argument}`);
  }
  if ((options.text === null) === (options.inputFile === null)) throw new RangeError("exactly one of --text and --input-file is required");
  if (!options.output) throw new RangeError("output PNG path is required");
  if (!["hcc2df", "raw"].includes(options.fileFormat)) throw new RangeError("file format must be hcc2df or raw");
  if (!["qr", "hcc2d4", "hcc2d8"].includes(options.mode)) throw new RangeError("mode must be qr, hcc2d4, or hcc2d8");
  if (!["L", "M", "Q", "H"].includes(options.ecLevel)) throw new RangeError("EC level must be one of L/M/Q/H");
  if (!["model1", "model2"].includes(options.palette)) throw new RangeError("palette must be model1 or model2");
  if (!Number.isInteger(options.version) || options.version < 0 || options.version > 40) throw new RangeError("version must be an integer from 0 to 40");
  if (!Number.isInteger(options.scale) || options.scale < 6 || options.scale > 1000) throw new RangeError("scale must be an integer from 6 to 1000");
  if (!Number.isInteger(options.quietZone) || options.quietZone < 0 || options.quietZone > 1000) throw new RangeError("quiet zone must be an integer from 0 to 1000");
  return options;
}

function friendlyError(error, options, payload) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("payload does not fit in any supported version") && options) {
    const payloadSize = payload?.length ?? "unknown";
    return `Error: with mode=${options.mode} and ec_level=${options.ecLevel} the payload (${payloadSize} bytes) does not fit in any supported symbol. Try a lower EC level or a higher-capacity mode.`;
  }
  return `Error: ${message}`;
}

export function main(argv = process.argv.slice(2), io = console) {
  if (argv.length === 0) { io.log(HELP); return 0; }
  let options;
  let payload;
  try {
    options = parseArguments(argv);
    if (options.help) { io.log(HELP); return 0; }
    if (options.versionInfo) { io.log("0.9.0-rc.2"); return 0; }
    if (!Number.isInteger(options.version) || options.version < 0 || options.version > 40) throw new RangeError("version must be an integer from 0 to 40");
    if (!Number.isInteger(options.scale) || options.scale < 6 || options.scale > 1000) throw new RangeError("scale must be an integer from 6 to 1000");
    if (!Number.isInteger(options.quietZone) || options.quietZone < 0 || options.quietZone > 1000) throw new RangeError("quiet zone must be an integer from 0 to 1000");
    const source = options.text !== null ? Buffer.from(options.text, "utf8") : readFileSync(options.inputFile);
    if (source.length === 0) throw new RangeError("payload is empty");
    const sourceName = options.text !== null ? "text.txt" : basename(options.inputFile);
    const sourceKind = options.text !== null ? "text" : "file";
    payload = options.fileFormat === "hcc2df" ? buildHcc2dfPayload(sourceName, source) : source;
    const common = { ecLevel: options.ecLevel, version: options.version, scale: options.scale, quietZone: options.quietZone };
    let symbol;
    if (options.mode === "qr") symbol = encodeQr(payload, common);
    else {
      const palettes = options.mode === "hcc2d4"
        ? { model1: PALETTE_4_MODEL1, model2: PALETTE_4_MODEL2 }
        : { model1: PALETTE_8_MODEL1, model2: PALETTE_8_MODEL2 };
      symbol = encodeHcc2d(payload, { ...common, mode: options.mode, palette: palettes[options.palette] });
    }
    writePng(options.output, symbol);
    io.log(`wrote ${options.output} mode=${symbol.mode} ec=${symbol.ecLevel} version=${symbol.version} mask=${symbol.maskPattern} palette=${options.palette} size=${symbol.width}x${symbol.height} payload=${options.fileFormat}-${sourceKind}${options.fileFormat === "raw" ? "-bytes" : ""}`);
    return 0;
  } catch (error) {
    io.error(friendlyError(error, options, payload));
    return 1;
  }
}
