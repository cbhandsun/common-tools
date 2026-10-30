// @ts-check
"use strict";

const { types } = require("node:util");
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const lengthGetter = Object.getOwnPropertyDescriptor(typedArray, "length")?.get;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArray, "buffer")?.get;
const offsetGetter = Object.getOwnPropertyDescriptor(typedArray, "byteOffset")?.get;
const resizableGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")?.get;
const MAX_BYTES = 160_000_000;

/** Read native slots, never caller properties, iterators, constructors or species.
 * The returned plain view has no caller hooks. It shares fixed, unshared storage;
 * callers must copy before writing. Shared/resizable/detached storage is rejected
 * because validation and the subsequent synchronous reads must see stable bounds.
 * @param {unknown} input @param {number|null} [expectedLength] @returns {Uint8Array} */
function readApprovedFrameBytes(input, expectedLength = null) {
  if (expectedLength !== null && (!Number.isSafeInteger(expectedLength) || expectedLength < 0 || expectedLength > MAX_BYTES)) {
    throw new TypeError("invalid-byte-length");
  }
  if (input === null || typeof input !== "object" || types.isProxy(input) || !types.isUint8Array(input)
      || Object.getOwnPropertyDescriptor(input, "length")) throw new TypeError("invalid-bytes");
  if (!lengthGetter || !bufferGetter || !offsetGetter) throw new TypeError("typed-array-runtime");
  const length = Reflect.apply(lengthGetter, input, []);
  const buffer = Reflect.apply(bufferGetter, input, []);
  const byteOffset = Reflect.apply(offsetGetter, input, []);
  if (!types.isArrayBuffer(buffer) || (resizableGetter && Reflect.apply(resizableGetter, buffer, []))) throw new TypeError("invalid-bytes");
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_BYTES || (expectedLength !== null && length !== expectedLength)) {
    throw new TypeError("invalid-byte-length");
  }
  try { return new Uint8Array(buffer, byteOffset, length); }
  catch { throw new TypeError("invalid-bytes"); }
}

module.exports = { readApprovedFrameBytes };
