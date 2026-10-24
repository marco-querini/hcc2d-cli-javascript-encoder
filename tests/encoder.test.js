import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { inflateSync } from "node:zlib";

import {
  PALETTE_4_MODEL1,
  PALETTE_8_MODEL2,
  buildHcc2dfPayload,
  buildIndexedPng,
  encodeHcc2d,
  encodeQr,
  version,
  writePng,
} from "../src/index.js";
import { HELP, main, parseArguments } from "../src/cli.js";

const temporaryDirectories = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("package version is synchronized", () => assert.equal(version, "0.9.0"));

test("known QR output matches the C and Python reference encoders", () => {
  const symbol = encodeQr(Buffer.from("hello"), { scale: 6, quietZone: 0 });
  assert.equal(symbol.version, 1);
  assert.equal(symbol.maskPattern, 7);
  assert.equal(sha256(symbol.pixels), "ce8c1333713c8d36a789e69f6e50b9270bb614342fd4db0e50baf4e4bfc97330");
});

test("known HCC2D4 and HCC2D8 outputs match the reference encoders", () => {
  const four = encodeHcc2d(Buffer.from("hello"), { mode: "hcc2d4", scale: 6, quietZone: 0 });
  const eight = encodeHcc2d(Buffer.from("hello"), { mode: "hcc2d8", scale: 6, quietZone: 0, palette: PALETTE_8_MODEL2 });
  assert.equal(four.fullDimension, four.innerDimension + 2);
  assert.equal(eight.fullDimension, eight.innerDimension + 2);
  assert.deepEqual(four.palette, PALETTE_4_MODEL1);
  assert.deepEqual([four.version, four.maskPattern], [1, 0]);
  assert.deepEqual([eight.version, eight.maskPattern], [1, 4]);
  assert.equal(sha256(four.pixels), "c45b5b1d6d0e25f6c7235fe214781e186b6d384b4d061418fdef5398795baf17");
  assert.equal(sha256(eight.pixels), "d4b24381e4996a47d646fc8809352e46a566e0a9e6ad32f63056e0dc3390e596");
});

test("HCC2DF preserves basename and applies compression only when useful", () => {
  const compressed = buildHcc2dfPayload("folder/example.txt", Buffer.alloc(512, "A"));
  assert.equal(compressed.subarray(0, 6).toString("ascii"), "HCC2DF");
  assert.equal(compressed[6], 1);
  assert.equal(compressed[7], 1);
  assert.equal(compressed.subarray(9, 9 + compressed[8]).toString("utf8"), "example.txt");
  assert.deepEqual(inflateSync(compressed.subarray(9 + compressed[8])), Buffer.alloc(512, "A"));
  const raw = buildHcc2dfPayload("example.bin", Buffer.from("short payload"));
  assert.equal(raw[7], 0);
  assert.equal(raw.subarray(9 + raw[8]).toString(), "short payload");
});

test("HCC2DF validates UTF-8 filename length", () => {
  assert.throws(() => buildHcc2dfPayload("", Buffer.from("x")), /non-empty/);
  assert.throws(() => buildHcc2dfPayload("x".repeat(128), Buffer.from("x")), /at most 127/);
});

test("public API validates modes, payloads, palettes, and dimensions", () => {
  assert.throws(() => encodeQr(Buffer.alloc(0)), /payload is empty/);
  assert.throws(() => encodeHcc2d(Buffer.from("x"), { scale: 5 }), /6 to 1000/);
  assert.throws(() => encodeHcc2d(Buffer.from("x"), { mode: "hcc2d16" }), /hcc2d4 or hcc2d8/);
  assert.throws(() => encodeHcc2d(Buffer.from("x"), { palette: [[1, 0, 0], [220, 0, 0], [0, 200, 220], [255, 255, 255]] }), /index 0/);
  assert.throws(() => buildIndexedPng(2, 2, new Uint8Array(3), PALETTE_4_MODEL1), /pixel count/);
});

test("writePng writes a valid PNG signature", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hcc2d-js-test-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "symbol.png");
  writePng(path, encodeHcc2d(Buffer.from("file output")));
  assert.deepEqual(readFileSync(path).subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
});

test("CLI parser enforces mutually exclusive payload sources", () => {
  assert.throws(() => parseArguments(["--text", "a", "--input-file", "b", "out.png"]), /exactly one/);
  assert.throws(() => parseArguments(["--text", "a", "--version", "x", "out.png"]), /version/);
});

test("CLI generates output and reports controlled errors without stacks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hcc2d-js-cli-"));
  temporaryDirectories.push(directory);
  const output = join(directory, "symbol.png");
  const messages = { out: [], err: [] };
  const io = { log: (value) => messages.out.push(value), error: (value) => messages.err.push(value) };
  assert.equal(main(["--text", "hello", "--mode", "qr", "--file-format", "raw", output], io), 0);
  assert.match(messages.out.join("\n"), /mode=qr/);
  assert.equal(readFileSync(output).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(main(["--text", "hello", "--version", "41", output], io), 1);
  assert.match(messages.err.at(-1), /^Error: version/);
  assert.doesNotMatch(messages.err.at(-1), /stack|trace/i);
});

test("empty CLI invocation presents complete help", () => {
  const output = [];
  assert.equal(main([], { log: (value) => output.push(value), error: () => {} }), 0);
  assert.equal(output[0], HELP);
  assert.match(output[0], /Usage: hcc2d-encoder/);
  assert.match(output[0], /--file-format/);
});
