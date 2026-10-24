// HCC2D Encoder - pure JavaScript reference implementation
// Copyright 2010-2026 Marco Querini
// SPDX-License-Identifier: Apache-2.0
// Version 0.9.0
//
// Intended to conform to HCC2D Code Specification 0.9.0:
// https://doi.org/10.5281/zenodo.22206528

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

export const PALETTE_QR = Object.freeze([[0, 0, 0], [255, 255, 255]]);
export const PALETTE_4_MODEL1 = Object.freeze([[0, 0, 0], [220, 0, 0], [0, 200, 220], [255, 255, 255]]);
export const PALETTE_8_MODEL1 = Object.freeze([
  [0, 0, 0], [200, 0, 0], [0, 130, 0], [0, 60, 180],
  [0, 215, 235], [255, 220, 50], [255, 130, 230], [255, 255, 255],
]);
export const PALETTE_4_MODEL2 = Object.freeze([[0, 0, 0], [255, 0, 255], [0, 255, 255], [255, 255, 255]]);
export const PALETTE_8_MODEL2 = Object.freeze([
  [0, 0, 0], [0, 0, 255], [255, 0, 0], [255, 0, 255],
  [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 255, 255],
]);

const EC_LEVEL_BITS = Object.freeze({ L: 1, M: 0, Q: 3, H: 2 });
const EC_LEVEL_INDEX = Object.freeze({ L: 0, M: 1, Q: 2, H: 3 });
const MODE_BITS_BYTE = 0b0100;
const VERSION_INFO_POLY = 0x1f25;
const TYPE_INFO_POLY = 0x537;
const TYPE_INFO_MASK_PATTERN = 0x5412;

// [version, alignment centers, [ec words/block, group1 count/data, group2 count/data] x L/M/Q/H]
const QR_VERSIONS = [
  [1, [], [[7,1,19,0,0],[10,1,16,0,0],[13,1,13,0,0],[17,1,9,0,0]]],
  [2, [6,18], [[10,1,34,0,0],[16,1,28,0,0],[22,1,22,0,0],[28,1,16,0,0]]],
  [3, [6,22], [[15,1,55,0,0],[26,1,44,0,0],[18,2,17,0,0],[22,2,13,0,0]]],
  [4, [6,26], [[20,1,80,0,0],[18,2,32,0,0],[26,2,24,0,0],[16,4,9,0,0]]],
  [5, [6,30], [[26,1,108,0,0],[24,2,43,0,0],[18,2,15,2,16],[22,2,11,2,12]]],
  [6, [6,34], [[18,2,68,0,0],[16,4,27,0,0],[24,4,19,0,0],[28,4,15,0,0]]],
  [7, [6,22,38], [[20,2,78,0,0],[18,4,31,0,0],[18,2,14,4,15],[26,4,13,1,14]]],
  [8, [6,24,42], [[24,2,97,0,0],[22,2,38,2,39],[22,4,18,2,19],[26,4,14,2,15]]],
  [9, [6,26,46], [[30,2,116,0,0],[22,3,36,2,37],[20,4,16,4,17],[24,4,12,4,13]]],
  [10,[6,28,50], [[18,2,68,2,69],[26,4,43,1,44],[24,6,19,2,20],[28,6,15,2,16]]],
  [11,[6,30,54], [[20,4,81,0,0],[30,1,50,4,51],[28,4,22,4,23],[24,3,12,8,13]]],
  [12,[6,32,58], [[24,2,92,2,93],[22,6,36,2,37],[26,4,20,6,21],[28,7,14,4,15]]],
  [13,[6,34,62], [[26,4,107,0,0],[22,8,37,1,38],[24,8,20,4,21],[22,12,11,4,12]]],
  [14,[6,26,46,66], [[30,3,115,1,116],[24,4,40,5,41],[20,11,16,5,17],[24,11,12,5,13]]],
  [15,[6,26,48,70], [[22,5,87,1,88],[24,5,41,5,42],[30,5,24,7,25],[24,11,12,7,13]]],
  [16,[6,26,50,74], [[24,5,98,1,99],[28,7,45,3,46],[24,15,19,2,20],[30,3,15,13,16]]],
  [17,[6,30,54,78], [[28,1,107,5,108],[28,10,46,1,47],[28,1,22,15,23],[28,2,14,17,15]]],
  [18,[6,30,56,82], [[30,5,120,1,121],[26,9,43,4,44],[28,17,22,1,23],[28,2,14,19,15]]],
  [19,[6,30,58,86], [[28,3,113,4,114],[26,3,44,11,45],[26,17,21,4,22],[26,9,13,16,14]]],
  [20,[6,34,62,90], [[28,3,107,5,108],[26,3,41,13,42],[30,15,24,5,25],[28,15,15,10,16]]],
  [21,[6,28,50,72,94], [[28,4,116,4,117],[26,17,42,0,0],[28,17,22,6,23],[30,19,16,6,17]]],
  [22,[6,26,50,74,98], [[28,2,111,7,112],[28,17,46,0,0],[30,7,24,16,25],[24,34,13,0,0]]],
  [23,[6,30,54,78,102], [[30,4,121,5,122],[28,4,47,14,48],[30,11,24,14,25],[30,16,15,14,16]]],
  [24,[6,28,54,80,106], [[30,6,117,4,118],[28,6,45,14,46],[30,11,24,16,25],[30,30,16,2,17]]],
  [25,[6,32,58,84,110], [[26,8,106,4,107],[28,8,47,13,48],[30,7,24,22,25],[30,22,15,13,16]]],
  [26,[6,30,58,86,114], [[28,10,114,2,115],[28,19,46,4,47],[28,28,22,6,23],[30,33,16,4,17]]],
  [27,[6,34,62,90,118], [[30,8,122,4,123],[28,22,45,3,46],[30,8,23,26,24],[30,12,15,28,16]]],
  [28,[6,26,50,74,98,122], [[30,3,117,10,118],[28,3,45,23,46],[30,4,24,31,25],[30,11,15,31,16]]],
  [29,[6,30,54,78,102,126], [[30,7,116,7,117],[28,21,45,7,46],[30,1,23,37,24],[30,19,15,26,16]]],
  [30,[6,26,52,78,104,130], [[30,5,115,10,116],[28,19,47,10,48],[30,15,24,25,25],[30,23,15,25,16]]],
  [31,[6,30,56,82,108,134], [[30,13,115,3,116],[28,2,46,29,47],[30,42,24,1,25],[30,23,15,28,16]]],
  [32,[6,34,60,86,112,138], [[30,17,115,0,0],[28,10,46,23,47],[30,10,24,35,25],[30,19,15,35,16]]],
  [33,[6,30,58,86,114,142], [[30,17,115,1,116],[28,14,46,21,47],[30,29,24,19,25],[30,11,15,46,16]]],
  [34,[6,34,62,90,118,146], [[30,13,115,6,116],[28,14,46,23,47],[30,44,24,7,25],[30,59,16,1,17]]],
  [35,[6,30,54,78,102,126,150], [[30,12,121,7,122],[28,12,47,26,48],[30,39,24,14,25],[30,22,15,41,16]]],
  [36,[6,24,50,76,102,128,154], [[30,6,121,14,122],[28,6,47,34,48],[30,46,24,10,25],[30,2,15,64,16]]],
  [37,[6,28,54,80,106,132,158], [[30,17,122,4,123],[28,29,46,14,47],[30,49,24,10,25],[30,24,15,46,16]]],
  [38,[6,32,58,84,110,136,162], [[30,4,122,18,123],[28,13,46,32,47],[30,48,24,14,25],[30,42,15,32,16]]],
  [39,[6,26,54,82,110,138,166], [[30,20,117,4,118],[28,40,47,7,48],[30,43,24,22,25],[30,10,15,67,16]]],
  [40,[6,30,58,86,114,142,170], [[30,19,118,6,119],[28,18,47,31,48],[30,34,24,34,25],[30,20,15,61,16]]],
];

const MODE_SPECS = Object.freeze({
  qr: { planeCount: 1, borderPeriod: 0, defaultPalette: PALETTE_QR, multiplier: 1 },
  hcc2d4: { planeCount: 2, borderPeriod: 4, defaultPalette: PALETTE_4_MODEL1, multiplier: 2 },
  hcc2d8: { planeCount: 3, borderPeriod: 8, defaultPalette: PALETTE_8_MODEL1, multiplier: 3 },
});

class ECBlocks {
  constructor(codewordsPerBlock, count1, data1, count2, data2) {
    Object.assign(this, { codewordsPerBlock, count1, data1, count2, data2 });
  }
  get numBlocks() { return this.count1 + this.count2; }
  get totalCodewords() { return this.codewordsPerBlock * this.numBlocks; }
  get totalSymbolCodewords() {
    return this.count1 * (this.data1 + this.codewordsPerBlock)
      + this.count2 * (this.data2 + this.codewordsPerBlock);
  }
}

class VersionInfo {
  constructor(number, alignments, ecLevels) { Object.assign(this, { number, alignments, ecLevels }); }
  get dimension() { return 17 + 4 * this.number; }
}

const MODEL2_VERSIONS = QR_VERSIONS.map(([number, alignments, entries]) =>
  new VersionInfo(number, alignments, entries.map((entry) => new ECBlocks(...entry))));

class BitBuffer {
  constructor() { this.bits = []; }
  appendBit(value) { this.bits.push(value ? 1 : 0); }
  appendBits(value, count) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError("count must be non-negative");
    for (let shift = count - 1; shift >= 0; shift -= 1) this.bits.push((value >>> shift) & 1);
  }
  toBytes(bitOffset = 0, numBytes = null) {
    const available = this.bits.length - bitOffset;
    if (available < 0) throw new RangeError("bit offset out of range");
    const count = numBytes ?? Math.ceil(available / 8);
    const out = [];
    for (let byteIndex = 0; byteIndex < count; byteIndex += 1) {
      let value = 0;
      for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
        const source = bitOffset + byteIndex * 8 + bitIndex;
        value = (value << 1) | (source < this.bits.length ? this.bits[source] : 0);
      }
      out.push(value);
    }
    return out;
  }
}

class GF256 {
  constructor(primitive = 0x011d) {
    this.exp = Array(512).fill(0);
    this.log = Array(256).fill(0);
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      this.exp[i] = x;
      this.log[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= primitive;
    }
    for (let i = 255; i < 512; i += 1) this.exp[i] = this.exp[i - 255];
  }
  multiply(a, b) { return a === 0 || b === 0 ? 0 : this.exp[this.log[a] + this.log[b]]; }
}

const GF = new GF256();

function polynomialMultiply(a, b) {
  const out = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) out[i + j] ^= GF.multiply(a[i], b[j]);
  }
  return out;
}

function rsGeneratorPolynomial(degree) {
  let result = [1];
  for (let i = 0; i < degree; i += 1) result = polynomialMultiply(result, [1, GF.exp[i]]);
  return result;
}

function rsComputeRemainder(data, ecWords) {
  const generator = rsGeneratorPolynomial(ecWords);
  let remainder = Array(ecWords).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder = remainder.slice(1).concat(0);
    if (factor !== 0) {
      for (let i = 0; i < ecWords; i += 1) remainder[i] ^= GF.multiply(generator[i + 1], factor);
    }
  }
  return remainder;
}

function normalizePayload(payload) {
  if (payload instanceof Uint8Array) return new Uint8Array(payload);
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload.slice(0));
  throw new TypeError("payload must be a Uint8Array, Buffer, or ArrayBuffer");
}

function getVersion(mode, number) {
  if (!(mode in MODE_SPECS)) throw new RangeError(`unsupported mode: ${mode}`);
  if (!Number.isInteger(number) || number < 1 || number > 40) throw new RangeError("version must be 1-40");
  const base = MODEL2_VERSIONS[number - 1];
  const multiplier = MODE_SPECS[mode].multiplier;
  return new VersionInfo(base.number, base.alignments, base.ecLevels.map((entry) => new ECBlocks(
    entry.codewordsPerBlock, entry.count1 * multiplier, entry.data1, entry.count2 * multiplier, entry.data2,
  )));
}

function buildHeaderAndDataBits(payload, countBits = 16) {
  if (![8, 16].includes(countBits)) throw new RangeError("byte-count field must contain 8 or 16 bits");
  if (payload.length >= 2 ** countBits) throw new RangeError(`payload length does not fit in a ${countBits}-bit byte-count field`);
  const bits = new BitBuffer();
  bits.appendBits(MODE_BITS_BYTE, 4);
  bits.appendBits(payload.length, countBits);
  for (const byte of payload) bits.appendBits(byte, 8);
  return bits;
}

function willFit(mode, ecLevel, payload, version) {
  const countBits = mode === "qr" && version.number <= 9 ? 8 : 16;
  if (payload.length >= 2 ** countBits) return false;
  const bits = buildHeaderAndDataBits(payload, countBits);
  const ec = version.ecLevels[EC_LEVEL_INDEX[ecLevel]];
  return ec.totalSymbolCodewords - ec.totalCodewords >= Math.ceil(bits.bits.length / 8);
}

function chooseVersion(mode, ecLevel, payload) {
  for (let number = 1; number <= 40; number += 1) {
    const version = getVersion(mode, number);
    if (willFit(mode, ecLevel, payload, version)) return version;
  }
  throw new RangeError("payload does not fit in any supported version");
}

/**
 * Wrap file bytes in the HCC2DF container described by specification section 17.
 * @param {string} filename basename stored as UTF-8 metadata
 * @param {Uint8Array|Buffer|ArrayBuffer} content file content
 * @returns {Buffer}
 */
export function buildHcc2dfPayload(filename, content) {
  const bytes = normalizePayload(content);
  const basename = String(filename).replaceAll("\\", "/").split("/").at(-1);
  const name = new TextEncoder().encode(basename);
  if (name.length === 0) throw new RangeError("input filename must be non-empty");
  if (name.length > 127) throw new RangeError("input filename must be at most 127 UTF-8 bytes");
  const compressed = deflateSync(bytes);
  const useCompressed = bytes.length >= 128 && compressed.length < bytes.length * 0.9;
  const stored = useCompressed ? compressed : bytes;
  return Buffer.concat([
    Buffer.from("HCC2DF", "ascii"), Buffer.from([1, useCompressed ? 1 : 0, name.length]),
    Buffer.from(name), Buffer.from(stored),
  ]);
}

function terminateBits(numDataBytes, bits) {
  const capacity = numDataBytes * 8;
  if (bits.bits.length > capacity) throw new RangeError("data bits exceed symbol capacity");
  for (let i = 0; i < Math.min(4, capacity - bits.bits.length); i += 1) bits.appendBit(false);
  while (bits.bits.length % 8 !== 0) bits.appendBit(false);
  const padding = [0xec, 0x11];
  let index = 0;
  while (bits.bits.length < capacity) { bits.appendBits(padding[index % 2], 8); index += 1; }
}

function getBlockLayout(totalBytes, dataBytes, blockCount, blockId) {
  if (blockId >= blockCount) throw new RangeError("block id out of range");
  const group2 = totalBytes % blockCount;
  const group1 = blockCount - group2;
  const total1 = Math.floor(totalBytes / blockCount);
  const data1 = Math.floor(dataBytes / blockCount);
  return blockId < group1 ? [data1, total1 - data1] : [data1 + 1, total1 - data1];
}

function interleaveWithEcBytes(bits, totalBytes, dataBytes, blockCount) {
  if (Math.floor(bits.bits.length / 8) !== dataBytes) throw new Error("data byte count mismatch");
  const source = bits.toBytes();
  const blocks = [];
  let offset = 0;
  let maxData = 0;
  let maxEc = 0;
  for (let blockId = 0; blockId < blockCount; blockId += 1) {
    const [dataLength, ecLength] = getBlockLayout(totalBytes, dataBytes, blockCount, blockId);
    const data = source.slice(offset, offset + dataLength);
    const ec = rsComputeRemainder(data, ecLength);
    blocks.push([data, ec]);
    offset += dataLength;
    maxData = Math.max(maxData, dataLength);
    maxEc = Math.max(maxEc, ecLength);
  }
  const result = new BitBuffer();
  for (let i = 0; i < maxData; i += 1) for (const [data] of blocks) if (i < data.length) result.appendBits(data[i], 8);
  for (let i = 0; i < maxEc; i += 1) for (const [, ec] of blocks) if (i < ec.length) result.appendBits(ec[i], 8);
  return result;
}

function extractPlaneBits(bits, offset, count) {
  const result = [];
  for (let i = offset; i < bits.length; i += count) result.push(bits[i]);
  return result;
}

function dataMaskBit(mask, x, y) {
  if (mask === 0) return (y + x) % 2 === 0;
  if (mask === 1) return y % 2 === 0;
  if (mask === 2) return x % 3 === 0;
  if (mask === 3) return (y + x) % 3 === 0;
  if (mask === 4) return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
  if (mask === 5) return (y * x) % 6 === 0;
  if (mask === 6) return (y * x) % 6 < 3;
  if (mask === 7) return (y + x + ((y * x) % 3)) % 2 === 0;
  throw new RangeError("invalid mask pattern");
}

const emptyMatrix = (dimension) => Array.from({ length: dimension }, () => Array(dimension).fill(null));

function setIfInside(matrix, x, y, value) {
  if (x >= 0 && y >= 0 && x < matrix.length && y < matrix.length) matrix[y][x] = value;
}

function embedFinder(matrix, x0, y0) {
  for (let y = 0; y < 7; y += 1) for (let x = 0; x < 7; x += 1) {
    matrix[y0 + y][x0 + x] = Math.max(Math.abs(x - 3), Math.abs(y - 3)) !== 2 ? 1 : 0;
  }
  for (let i = -1; i < 8; i += 1) {
    setIfInside(matrix, x0 + i, y0 - 1, 0); setIfInside(matrix, x0 + i, y0 + 7, 0);
    setIfInside(matrix, x0 - 1, y0 + i, 0); setIfInside(matrix, x0 + 7, y0 + i, 0);
  }
}

function embedFinders(matrix) {
  const dimension = matrix.length;
  embedFinder(matrix, 0, 0); embedFinder(matrix, dimension - 7, 0); embedFinder(matrix, 0, dimension - 7);
}

function embedAlignment(matrix, x0, y0) {
  for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) {
    matrix[y0 + y][x0 + x] = Math.max(Math.abs(x - 2), Math.abs(y - 2)) !== 1 ? 1 : 0;
  }
}

function embedAlignments(version, matrix) {
  if (version.number < 2) return;
  const dimension = matrix.length;
  for (const y of version.alignments) for (const x of version.alignments) {
    if ((x === 6 && y === 6) || (x === 6 && y === dimension - 7) || (x === dimension - 7 && y === 6)) continue;
    embedAlignment(matrix, x - 2, y - 2);
  }
}

function embedTiming(matrix) {
  for (let i = 8; i < matrix.length - 8; i += 1) {
    const bit = (i + 1) % 2 ? 1 : 0;
    matrix[6][i] = bit; matrix[i][6] = bit;
  }
}

function bchCode(input, polynomial) {
  const msb = 32 - Math.clz32(polynomial);
  let value = input << (msb - 1);
  while (value !== 0 && 32 - Math.clz32(value) >= msb) value ^= polynomial << (32 - Math.clz32(value) - msb);
  return value;
}

function typeInfoBits(ecLevel, mask) {
  const typeInfo = (EC_LEVEL_BITS[ecLevel] << 3) | mask;
  const value = ((typeInfo << 10) | bchCode(typeInfo, TYPE_INFO_POLY)) ^ TYPE_INFO_MASK_PATTERN;
  return Array.from({ length: 15 }, (_, i) => (value >>> (14 - i)) & 1);
}

function embedTypeInfo(ecLevel, mask, matrix) {
  const coordinates = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  const bits = typeInfoBits(ecLevel, mask);
  const dimension = matrix.length;
  for (let i = 0; i < bits.length; i += 1) {
    const bit = bits[bits.length - 1 - i];
    const [x, y] = coordinates[i];
    matrix[y][x] = bit;
    if (i < 8) matrix[8][dimension - i - 1] = bit;
    else matrix[dimension - 7 + i - 8][8] = bit;
  }
}

function embedVersionInfo(version, matrix) {
  if (version.number < 7) return;
  const value = (version.number << 12) | bchCode(version.number, VERSION_INFO_POLY);
  const bits = Array.from({ length: 18 }, (_, i) => (value >>> (17 - i)) & 1);
  let bitIndex = bits.length - 1;
  for (let i = 0; i < 6; i += 1) for (let j = 0; j < 3; j += 1) {
    const bit = bits[bitIndex--];
    matrix[matrix.length - 11 + j][i] = bit;
    matrix[i][matrix.length - 11 + j] = bit;
  }
}

function embedDataBits(dataBits, mask, matrix) {
  const dimension = matrix.length;
  let bitIndex = 0;
  let direction = -1;
  let x = dimension - 1;
  let y = dimension - 1;
  while (x > 0) {
    if (x === 6) x -= 1;
    while (y >= 0 && y < dimension) {
      for (let xx = x; xx > x - 2; xx -= 1) {
        if (matrix[y][xx] !== null) continue;
        let bit = bitIndex < dataBits.length ? dataBits[bitIndex] : 0;
        bitIndex += 1;
        if (dataMaskBit(mask, xx, y)) bit ^= 1;
        matrix[y][xx] = bit;
      }
      y += direction;
    }
    direction = -direction; y += direction; x -= 2;
  }
  if (bitIndex < dataBits.length) throw new Error(`not all bits consumed: ${bitIndex}/${dataBits.length}`);
}

function buildMatrix(dataBits, ecLevel, version, mask) {
  const matrix = emptyMatrix(version.dimension);
  embedFinders(matrix); matrix[matrix.length - 8][8] = 1; embedAlignments(version, matrix); embedTiming(matrix);
  embedTypeInfo(ecLevel, mask, matrix); embedVersionInfo(version, matrix); embedDataBits(dataBits, mask, matrix);
  return matrix.map((row) => row.map((cell) => cell ?? 0));
}

function functionPattern(version) {
  const matrix = emptyMatrix(version.dimension);
  embedFinders(matrix); matrix[matrix.length - 8][8] = 1; embedAlignments(version, matrix); embedTiming(matrix);
  embedTypeInfo("L", 0, matrix); embedVersionInfo(version, matrix);
  return matrix.map((row) => row.map((cell) => cell !== null));
}

function penaltyRule1(matrix) {
  let penalty = 0;
  for (const horizontal of [true, false]) for (let i = 0; i < matrix.length; i += 1) {
    let run = 0; let previous = -1;
    for (let j = 0; j < matrix.length; j += 1) {
      const bit = horizontal ? matrix[i][j] : matrix[j][i];
      if (bit === previous) run += 1;
      else { if (run >= 5) penalty += 3 + run - 5; run = 1; previous = bit; }
    }
    if (run >= 5) penalty += 3 + run - 5;
  }
  return penalty;
}

function penaltyRule2(matrix) {
  let blocks = 0;
  for (let y = 0; y < matrix.length - 1; y += 1) for (let x = 0; x < matrix.length - 1; x += 1) {
    const value = matrix[y][x];
    if (value === matrix[y][x + 1] && value === matrix[y + 1][x] && value === matrix[y + 1][x + 1]) blocks += 1;
  }
  return blocks * 3;
}

function patternAt(pattern, line, start) {
  if (start < 0 || start + pattern.length > line.length) return false;
  return pattern.every((value, index) => line[start + index] === value);
}

function allZero(values) { return values.every((value) => value === 0); }

function penaltyRule3(matrix) {
  const finder = [1, 0, 1, 1, 1, 0, 1];
  let count = 0;
  for (const line of [...matrix, ...matrix.map((_, x) => matrix.map((row) => row[x]))]) {
    for (let offset = 0; offset < line.length; offset += 1) {
      if (!patternAt(finder, line, offset)) continue;
      const before = line.slice(Math.max(0, offset - 4), offset);
      const after = line.slice(offset + 7, Math.min(line.length, offset + 11));
      // Match the reference implementation's boundary behavior exactly:
      // an empty leading slice does not match, while an empty trailing slice does.
      if ((before.length > 0 && allZero(before)) || allZero(after)) count += 1;
    }
  }
  return count * 40;
}

function maskPenalty(matrix) {
  const total = matrix.length ** 2;
  const dark = matrix.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);
  const rule4 = Math.floor((Math.abs(dark * 2 - total) * 10) / total) * 10;
  return penaltyRule1(matrix) + penaltyRule2(matrix) + penaltyRule3(matrix) + rule4;
}

function chooseMask(bits, ecLevel, version) {
  let bestMask = 0; let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const penalty = maskPenalty(buildMatrix(bits, ecLevel, version, mask));
    if (penalty < bestPenalty) { bestPenalty = penalty; bestMask = mask; }
  }
  return bestMask;
}

function borderColor(row, column, dimension, period) {
  if (row === -1 && column >= 8 && column < dimension - 8) return (column - 8) % period;
  if (row === dimension && column >= 8 && column < dimension) return (column - 8) % period;
  if (column === -1) {
    const start = dimension - 9;
    if (row >= 8 && row <= start) return (start - row) % period;
  }
  if (column === dimension && row >= 8 && row < dimension) return (row - 8) % period;
  return period - 1;
}

function renderModules(planes, version, mode) {
  const spec = MODE_SPECS[mode];
  const dimension = version.dimension;
  const white = spec.borderPeriod - 1;
  const result = Array.from({ length: dimension + 2 }, () => Array(dimension + 2).fill(white));
  const functions = functionPattern(version);
  for (let y = -1; y <= dimension; y += 1) for (let x = -1; x <= dimension; x += 1) {
    let color;
    if (x >= 0 && y >= 0 && x < dimension && y < dimension) {
      if (functions[y][x]) color = planes[0][y][x] ? 0 : white;
      else { color = 0; for (let plane = 0; plane < spec.planeCount; plane += 1) color = (color << 1) | planes[plane][y][x]; }
    } else color = borderColor(y, x, dimension, spec.borderPeriod);
    result[y + 1][x + 1] = color;
  }
  return result;
}

function rasterize(modules, scale, quietZone, background) {
  const size = (modules.length + quietZone * 2) * scale;
  const pixels = new Uint8Array(size * size).fill(background);
  for (let my = 0; my < modules.length; my += 1) for (let mx = 0; mx < modules.length; mx += 1) {
    const baseX = (mx + quietZone) * scale;
    const baseY = (my + quietZone) * scale;
    for (let dy = 0; dy < scale; dy += 1) pixels.fill(modules[my][mx], (baseY + dy) * size + baseX, (baseY + dy) * size + baseX + scale);
  }
  return { width: size, height: size, pixels };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(value) { const buffer = Buffer.alloc(4); buffer.writeUInt32BE(value >>> 0); return buffer; }
function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  return Buffer.concat([u32(data.length), name, data, u32(crc32(Buffer.concat([name, data])))]);
}

/**
 * Serialize indexed pixels and an RGB palette as a minimal PNG.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|number[]} indices
 * @param {number[][]} palette
 * @returns {Buffer}
 */
export function buildIndexedPng(width, height, indices, palette) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new RangeError("PNG dimensions must be positive integers");
  if (indices.length !== width * height) throw new RangeError("pixel count does not match PNG dimensions");
  const pixelBytes = indices instanceof Uint8Array ? indices : Uint8Array.from(indices);
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) Buffer.from(pixelBytes.buffer, pixelBytes.byteOffset + y * width, width).copy(raw, y * (width + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 3, 0, 0, 0], 8);
  const plte = Buffer.from(palette.flat());
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), pngChunk("IHDR", ihdr), pngChunk("PLTE", plte),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Fully encoded symbol with indexed raster pixels and PNG serialization. */
export class EncodedSymbol {
  constructor(values) { Object.assign(this, values); }
  toPng() { return buildIndexedPng(this.width, this.height, this.pixels, this.palette); }
}

function validateCommon(payload, ecLevel, version, scale, quietZone) {
  if (payload.length === 0) throw new RangeError("payload is empty");
  if (!(ecLevel in EC_LEVEL_INDEX)) throw new RangeError("ec level must be one of L/M/Q/H");
  if (!Number.isInteger(version) || version < 0 || version > 40) throw new RangeError("version must be 0-40");
  if (!Number.isInteger(scale) || scale < 6 || scale > 1000) throw new RangeError("scale must be an integer from 6 to 1000");
  if (!Number.isInteger(quietZone) || quietZone < 0 || quietZone > 1000) throw new RangeError("quiet zone must be an integer from 0 to 1000");
}

function validatePalette(palette, size) {
  if (!Array.isArray(palette) || palette.length !== size) throw new RangeError(`palette must have exactly ${size} entries`);
  for (const color of palette) if (!Array.isArray(color) || color.length !== 3 || color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) throw new RangeError("palette entries must be RGB byte triples");
  if (palette[0].some((channel) => channel !== 0)) throw new RangeError("palette index 0 must be (0, 0, 0) — spec §5.8");
  if (palette.at(-1).some((channel) => channel !== 255)) throw new RangeError("palette last index must be (255, 255, 255) — spec §5.8");
}

/**
 * Encode bytes as HCC2D4 or HCC2D8.
 * @param {Uint8Array|Buffer|ArrayBuffer} payloadInput
 * @param {{mode?: "hcc2d4"|"hcc2d8", ecLevel?: "L"|"M"|"Q"|"H", version?: number, scale?: number, quietZone?: number, palette?: number[][]}} options
 * @returns {EncodedSymbol}
 */
export function encodeHcc2d(payloadInput, options = {}) {
  const payload = normalizePayload(payloadInput);
  const { mode = "hcc2d4", ecLevel = "Q", version = 0, scale = 12, quietZone = 4 } = options;
  if (!["hcc2d4", "hcc2d8"].includes(mode)) throw new RangeError("mode must be hcc2d4 or hcc2d8");
  validateCommon(payload, ecLevel, version, scale, quietZone);
  const spec = MODE_SPECS[mode];
  const palette = options.palette ?? spec.defaultPalette;
  validatePalette(palette, 2 ** spec.planeCount);
  const selected = version ? getVersion(mode, version) : chooseVersion(mode, ecLevel, payload);
  if (!willFit(mode, ecLevel, payload, selected)) {
    const ec = selected.ecLevels[EC_LEVEL_INDEX[ecLevel]];
    throw new RangeError(`${mode} payload is ${payload.length} bytes but version ${version} at EC ${ecLevel} fits at most ${Math.max(0, ec.totalSymbolCodewords - ec.totalCodewords - 3)} bytes`);
  }
  const ec = selected.ecLevels[EC_LEVEL_INDEX[ecLevel]];
  const totalBytes = ec.totalSymbolCodewords;
  const dataBytes = totalBytes - ec.totalCodewords;
  const bits = buildHeaderAndDataBits(payload);
  terminateBits(dataBytes, bits);
  const finalBits = interleaveWithEcBytes(bits, totalBytes, dataBytes, ec.numBlocks);
  const proxy = extractPlaneBits(finalBits.bits, 0, spec.planeCount).map((bit) => bit ? 0 : 1);
  const renderVersion = MODEL2_VERSIONS[selected.number - 1];
  const maskPattern = chooseMask(proxy, ecLevel, renderVersion);
  const planes = Array.from({ length: spec.planeCount }, (_, plane) => buildMatrix(extractPlaneBits(finalBits.bits, plane, spec.planeCount), ecLevel, renderVersion, maskPattern));
  const modules = renderModules(planes, renderVersion, mode);
  const image = rasterize(modules, scale, quietZone, palette.length - 1);
  return new EncodedSymbol({ mode, ecLevel, version: selected.number, innerDimension: selected.dimension, fullDimension: modules.length, maskPattern, palette, ...image });
}

/**
 * Encode bytes as a standard QR Code using byte mode.
 * @param {Uint8Array|Buffer|ArrayBuffer} payloadInput
 * @param {{ecLevel?: "L"|"M"|"Q"|"H", version?: number, scale?: number, quietZone?: number}} options
 * @returns {EncodedSymbol}
 */
export function encodeQr(payloadInput, options = {}) {
  const payload = normalizePayload(payloadInput);
  const { ecLevel = "Q", version = 0, scale = 12, quietZone = 4 } = options;
  validateCommon(payload, ecLevel, version, scale, quietZone);
  const selected = version ? getVersion("qr", version) : chooseVersion("qr", ecLevel, payload);
  if (!willFit("qr", ecLevel, payload, selected)) {
    const ec = selected.ecLevels[EC_LEVEL_INDEX[ecLevel]];
    const countBits = selected.number <= 9 ? 8 : 16;
    const capacity = Math.max(0, Math.floor(((ec.totalSymbolCodewords - ec.totalCodewords) * 8 - 4 - countBits) / 8));
    throw new RangeError(`qr payload is ${payload.length} bytes but version ${version} at EC ${ecLevel} fits at most ${capacity} bytes`);
  }
  const ec = selected.ecLevels[EC_LEVEL_INDEX[ecLevel]];
  const totalBytes = ec.totalSymbolCodewords;
  const dataBytes = totalBytes - ec.totalCodewords;
  const bits = buildHeaderAndDataBits(payload, selected.number <= 9 ? 8 : 16);
  terminateBits(dataBytes, bits);
  const finalBits = interleaveWithEcBytes(bits, totalBytes, dataBytes, ec.numBlocks);
  const maskPattern = chooseMask(finalBits.bits, ecLevel, selected);
  const matrix = buildMatrix(finalBits.bits, ecLevel, selected, maskPattern);
  const modules = matrix.map((row) => row.map((cell) => cell ? 0 : 1));
  const image = rasterize(modules, scale, quietZone, 1);
  return new EncodedSymbol({ mode: "qr", ecLevel, version: selected.number, innerDimension: selected.dimension, fullDimension: selected.dimension, maskPattern, palette: PALETTE_QR, ...image });
}

/** Write an EncodedSymbol as an indexed PNG file. */
export function writePng(path, symbol) {
  if (!(symbol instanceof EncodedSymbol)) throw new TypeError("symbol must be an EncodedSymbol");
  writeFileSync(path, symbol.toPng());
}
