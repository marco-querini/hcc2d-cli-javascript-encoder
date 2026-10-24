#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";

import {
  PALETTE_4_MODEL1,
  PALETTE_4_MODEL2,
  PALETTE_8_MODEL1,
  PALETTE_8_MODEL2,
  encodeHcc2d,
  encodeQr,
} from "../src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(root, "..");
const cRepository = resolve(process.env.HCC2D_C_REFERENCE_DIR || join(workspace, "hcc2d_cli_encoder_2026"));
const pythonRepository = resolve(process.env.HCC2D_PYTHON_REFERENCE_DIR || join(workspace, "hcc2d_cli_python_encoder_2026"));
const cSource = join(cRepository, "single_file_c_hcc2d_encoder_v0.9.0.c");
const pythonSource = join(pythonRepository, "src");

if (!existsSync(cSource)) throw new Error(`C reference source not found: ${cSource}`);
if (!existsSync(join(pythonSource, "hcc2d_encoder", "encoder.py"))) throw new Error(`Python reference package not found: ${pythonSource}`);

const temporary = mkdtempSync(join(tmpdir(), "hcc2d-js-reference-"));
const cBinary = join(temporary, "hcc2d_encoder");
const payload = Buffer.from("x");
const ecLevels = ["L", "M", "Q", "H"];
const variants = [
  { mode: "qr", paletteName: "model1", palette: null },
  { mode: "hcc2d4", paletteName: "model1", palette: PALETTE_4_MODEL1 },
  { mode: "hcc2d4", paletteName: "model2", palette: PALETTE_4_MODEL2 },
  { mode: "hcc2d8", paletteName: "model1", palette: PALETTE_8_MODEL1 },
  { mode: "hcc2d8", paletteName: "model2", palette: PALETTE_8_MODEL2 },
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function inspectPng(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("Invalid PNG signature");
  let offset = 8;
  const chunks = new Map();
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (!chunks.has(type)) chunks.set(type, []);
    chunks.get(type).push(data);
    offset += length + 12;
  }
  return {
    ihdr: Buffer.concat(chunks.get("IHDR") || []),
    palette: Buffer.concat(chunks.get("PLTE") || []),
    scanlines: inflateSync(Buffer.concat(chunks.get("IDAT") || [])),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed (${result.status ?? result.error?.code}):\n${result.stderr || result.stdout || result.error}`);
  }
}

function runExpectingFailure(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error || result.status === 0) {
    throw new Error(`${command} unexpectedly succeeded: ${result.stdout || result.stderr || result.error}`);
  }
}

function paletteFor(mode, paletteName) {
  if (mode === "hcc2d4") return paletteName === "model2" ? PALETTE_4_MODEL2 : PALETTE_4_MODEL1;
  if (mode === "hcc2d8") return paletteName === "model2" ? PALETTE_8_MODEL2 : PALETTE_8_MODEL1;
  return null;
}

function encodeJavascript(payloadBytes, { mode, ecLevel, version, paletteName = "model1" }) {
  const common = { ecLevel, version, scale: 6, quietZone: 0 };
  return mode === "qr"
    ? encodeQr(payloadBytes, common)
    : encodeHcc2d(payloadBytes, { ...common, mode, palette: paletteFor(mode, paletteName) });
}

function deterministicPayload(length, seed) {
  return Buffer.from({ length }, (_, index) => (index * 131 + seed * 17 + (index >>> 3)) & 0xff);
}

function referenceArguments(payloadPath, outputPath, { mode, ecLevel, version, paletteName = "model1" }) {
  return [
    "--input-file", payloadPath,
    "--mode", mode,
    "--file-format", "raw",
    "--ec-level", ecLevel,
    "--version", String(version),
    "--scale", "6",
    "--quiet-zone", "0",
    "--palette", paletteName,
    outputPath,
  ];
}

function compareCase(label, payloadBytes, options) {
  const payloadPath = join(temporary, `${label}.bin`);
  const cOutput = join(temporary, `${label}-c.png`);
  const pythonOutput = join(temporary, `${label}-python.png`);
  writeFileSync(payloadPath, payloadBytes);
  run(cBinary, referenceArguments(payloadPath, cOutput, options));
  run(process.env.PYTHON || "python3", [
    "-m", "hcc2d_encoder", ...referenceArguments(payloadPath, pythonOutput, options),
  ], { env: { ...process.env, PYTHONPATH: pythonSource } });
  const pngs = [
    inspectPng(encodeJavascript(payloadBytes, options).toPng()),
    inspectPng(readFileSync(cOutput)),
    inspectPng(readFileSync(pythonOutput)),
  ];
  for (const field of ["ihdr", "palette", "scanlines"]) {
    const hashes = pngs.map((png) => sha256(png[field]));
    if (new Set(hashes).size !== 1) {
      throw new Error(`${label} ${field} differs: JavaScript=${hashes[0]} C=${hashes[1]} Python=${hashes[2]}`);
    }
  }
}

function assertRejectedByEveryEncoder(label, payloadBytes, options) {
  const payloadPath = join(temporary, `${label}.bin`);
  const cOutput = join(temporary, `${label}-c.png`);
  const pythonOutput = join(temporary, `${label}-python.png`);
  writeFileSync(payloadPath, payloadBytes);
  try {
    encodeJavascript(payloadBytes, options);
    throw new Error(`JavaScript unexpectedly accepted ${label}`);
  } catch (error) {
    if (!String(error?.message).includes("fits at most")) throw error;
  }
  runExpectingFailure(cBinary, referenceArguments(payloadPath, cOutput, options));
  runExpectingFailure(process.env.PYTHON || "python3", [
    "-m", "hcc2d_encoder", ...referenceArguments(payloadPath, pythonOutput, options),
  ], { env: { ...process.env, PYTHONPATH: pythonSource } });
}

function capacityFor(options) {
  try {
    encodeJavascript(Buffer.alloc(100_000), options);
  } catch (error) {
    const match = String(error?.message).match(/fits at most (\d+) bytes/);
    if (match) return Number(match[1]);
    throw error;
  }
  throw new Error(`Capacity probe unexpectedly fitted for ${JSON.stringify(options)}`);
}

try {
  run(process.env.CC || "cc", ["-std=c11", "-O2", "-o", cBinary, cSource, "-lz"]);
  let checked = 0;
  for (let version = 1; version <= 40; version += 1) {
    for (const ecLevel of ecLevels) {
      for (const variant of variants) {
        const stem = `${variant.mode}-${variant.paletteName}-${ecLevel}-v${version}`;
        const cOutput = join(temporary, `${stem}-c.png`);
        const pythonOutput = join(temporary, `${stem}-python.png`);
        run(cBinary, [
          "--text", "x", "--mode", variant.mode, "--file-format", "raw", "--ec-level", ecLevel,
          "--version", String(version), "--scale", "6", "--quiet-zone", "0", "--palette", variant.paletteName, cOutput,
        ]);
        run(process.env.PYTHON || "python3", [
          "-m", "hcc2d_encoder", "--text", "x", "--mode", variant.mode, "--file-format", "raw", "--ec-level", ecLevel,
          "--version", String(version), "--scale", "6", "--quiet-zone", "0", "--palette", variant.paletteName, pythonOutput,
        ], { env: { ...process.env, PYTHONPATH: pythonSource } });
        const symbol = variant.mode === "qr"
          ? encodeQr(payload, { ecLevel, version, scale: 6, quietZone: 0 })
          : encodeHcc2d(payload, { mode: variant.mode, ecLevel, version, scale: 6, quietZone: 0, palette: variant.palette });
        const pngs = [inspectPng(symbol.toPng()), inspectPng(readFileSync(cOutput)), inspectPng(readFileSync(pythonOutput))];
        for (const field of ["ihdr", "palette", "scanlines"]) {
          const hashes = pngs.map((png) => sha256(png[field]));
          if (new Set(hashes).size !== 1) throw new Error(`${stem} ${field} differs: JavaScript=${hashes[0]} C=${hashes[1]} Python=${hashes[2]}`);
        }
        checked += 1;
      }
    }
  }
  const boundaryCases = [
    ...["qr", "hcc2d4", "hcc2d8"].map((mode) => ({ mode, ecLevel: "Q", version: 1, paletteName: "model1" })),
    ...["qr", "hcc2d4", "hcc2d8"].map((mode) => ({ mode, ecLevel: "M", version: 10, paletteName: "model2" })),
    ...["qr", "hcc2d4", "hcc2d8"].map((mode) => ({ mode, ecLevel: "H", version: 27, paletteName: "model2" })),
    ...["qr", "hcc2d4", "hcc2d8"].map((mode) => ({ mode, ecLevel: "L", version: 40, paletteName: "model1" })),
  ];
  let rejected = 0;
  for (const [index, options] of boundaryCases.entries()) {
    const capacity = capacityFor(options);
    const label = `boundary-${options.mode}-${options.ecLevel}-v${options.version}`;
    compareCase(label, deterministicPayload(capacity, index + 1), options);
    checked += 1;
    assertRejectedByEveryEncoder(`${label}-overflow`, deterministicPayload(capacity + 1, index + 101), options);
    rejected += 1;
  }

  for (const mode of ["qr", "hcc2d4", "hcc2d8"]) {
    for (const ecLevel of ["L", "H"]) {
      const paletteName = ecLevel === "H" ? "model2" : "model1";
      const versionOneCapacity = capacityFor({ mode, ecLevel, version: 1, paletteName });
      const versionFortyCapacity = capacityFor({ mode, ecLevel, version: 40, paletteName });
      const lengths = new Set([
        1,
        versionOneCapacity,
        versionOneCapacity + 1,
        Math.floor(versionFortyCapacity / 3),
        Math.floor(versionFortyCapacity * 2 / 3),
      ]);
      let caseIndex = 0;
      for (const length of lengths) {
        const options = { mode, ecLevel, version: 0, paletteName };
        compareCase(`auto-${mode}-${ecLevel}-${length}`, deterministicPayload(length, checked + caseIndex), options);
        checked += 1;
        caseIndex += 1;
      }
    }
  }

  console.log(`Validated ${checked} parity PNGs and ${rejected} exact rejection boundaries: JavaScript, C, and Python agree on dimensions, palettes, decompressed pixels, automatic version selection, binary payloads, and capacity limits.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
