// @ts-check
"use strict";

const { types } = require("node:util");

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TRAILING_BYTES = 64 * 1024;
const MAX_MARKERS = 16384;
const FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Locate a structural marker without treating stuffed entropy bytes or restart markers as segment headers.
 * @param {Buffer} buffer @param {number} start */
function nextScanMarker(buffer, start) {
  let offset = start;
  while (offset < buffer.length) {
    const prefix = buffer.indexOf(0xff, offset);
    if (prefix < 0) return -1;
    let markerOffset = prefix + 1;
    while (markerOffset < buffer.length && buffer[markerOffset] === 0xff) markerOffset += 1;
    const marker = buffer[markerOffset];
    if (marker === undefined) return -1;
    if (marker === 0 || (marker >= 0xd0 && marker <= 0xd7)) { offset = markerOffset + 1; continue; }
    return prefix;
  }
  return -1;
}

/**
 * Read JPEG geometry only after reaching a real EOI outside metadata segments
 * and entropy stuffing. Bounded trailing data is opaque and never executed or
 * expanded; the image decoder still validates pixel data during normalization.
 * @param {unknown} input
 * @returns {{widthPx:number,heightPx:number,encodedBytes:number,trailingBytes:number}}
 */
function admitJpegContainer(input) {
  if (types.isProxy(input) || !Buffer.isBuffer(input) || Object.getPrototypeOf(input) !== Buffer.prototype
    || Object.hasOwn(input, "length") || input.length < 4 || input.length > MAX_IMAGE_BYTES
    || input[0] !== 0xff || input[1] !== 0xd8) throw new Error("raw editable JPEG is incomplete");
  let offset = 2;
  let markers = 0;
  /** @type {{widthPx:number,heightPx:number} | null} */
  let dimensions = null;
  while (offset < input.length && ++markers <= MAX_MARKERS) {
    if (input[offset] !== 0xff) throw new Error("raw editable JPEG marker is invalid");
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    const marker = input[offset++];
    if (marker === undefined || marker === 0 || marker === 0xd8) throw new Error("raw editable JPEG marker is invalid");
    if (marker === 0xd9) {
      const trailingBytes = input.length - offset;
      if (!dimensions || trailingBytes > MAX_TRAILING_BYTES) throw new Error("raw editable JPEG dimensions or trailer are invalid");
      return { ...dimensions, encodedBytes: offset, trailingBytes };
    }
    if (marker === 1) continue;
    if (marker >= 0xd0 && marker <= 0xd7) throw new Error("raw editable JPEG restart marker is outside a scan");
    if (offset + 2 > input.length) throw new Error("raw editable JPEG segment is incomplete");
    const length = input.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > input.length) throw new Error("raw editable JPEG segment is incomplete");
    if (FRAME_MARKERS.has(marker)) {
      if (length < 8 || dimensions || input[offset + 2] === 0) throw new Error("raw editable JPEG frame is invalid");
      const heightPx = input.readUInt16BE(offset + 3);
      const widthPx = input.readUInt16BE(offset + 5);
      if (!widthPx || !heightPx) throw new Error("raw editable JPEG dimensions are invalid");
      dimensions = { widthPx, heightPx };
    }
    offset = end;
    if (marker !== 0xda) continue;
    if (!dimensions) throw new Error("raw editable JPEG scan precedes its frame");
    const next = nextScanMarker(input, offset);
    if (next < 0) throw new Error("raw editable JPEG is incomplete");
    offset = next;
  }
  throw new Error("raw editable JPEG is incomplete or exceeds marker limits");
}

module.exports = { admitJpegContainer };
