#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  console.log(`Validated ${checked} of ${checked} forced-version PNGs: JavaScript, C, and Python have identical dimensions, palettes, and decompressed pixels.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
