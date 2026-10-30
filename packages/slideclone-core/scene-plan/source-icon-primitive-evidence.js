// @ts-check
"use strict";

const { types } = require("node:util");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** A colored bounding box is not proof of a rectangular icon. Require a complete
 * isolated outline; pictorial/partially clipped regions stay on the fidelity path.
 * @param {unknown} input @returns {{type:"rect"|"ellipse",outlineAgreement:number,pixelBox:{x:number,y:number,w:number,h:number}}|null} */
function sourceIconPrimitiveEvidence(input) {
  if (!record(input) || !record(input.image) || !record(input.pixelBox) || typeof input.fill !== "string"
    || !/^#[a-f0-9]{6}$/iu.test(input.fill)) return null;
  const { width, height, rgba } = input.image;
  const { x: inputX, y: inputY, w: inputW, h: inputH } = input.pixelBox;
  if (![width, height, inputX, inputY, inputW, inputH].every(value => finite(value) && Number.isSafeInteger(value))
    || !finite(width) || !finite(height) || !finite(inputX) || !finite(inputY) || !finite(inputW) || !finite(inputH)
    || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 40000000
    || inputX < 2 || inputY < 2 || inputW < 6 || inputH < 6 || inputW > 512 || inputH > 512 || inputW * inputH > 262144
    || inputX + inputW + 2 > width || inputY + inputH + 2 > height || types.isProxy(rgba) || !types.isUint8Array(rgba)) return null;
  let x = inputX, y = inputY, w = inputW, h = inputH;
  const prototype = Object.getPrototypeOf(Uint8Array.prototype);
  const length = /** @type {unknown} */ (Reflect.get(prototype, "length", rgba));
  const buffer = /** @type {unknown} */ (Reflect.get(prototype, "buffer", rgba));
  const offset = /** @type {unknown} */ (Reflect.get(prototype, "byteOffset", rgba));
  if (length !== width * height * 4 || !types.isArrayBuffer(buffer) || !finite(offset)) return null;
  if (!finite(length)) return null;
  let data;
  try {
    data = new Uint8Array(buffer, offset, length);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
  const hex = input.fill;
  const fill = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16));
  /** @param {number} col @param {number} row */
  const color = (col, row) => {
    const index = (row * width + col) * 4;
    return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0, data[index + 3] ?? 0];
  };
  /** @param {number[]} a @param {number[]} b */
  const distance = (a, b) => Math.max(...[0, 1, 2].map(index => Math.abs((a[index] ?? 0) - (b[index] ?? 0))));
  const left = Math.max(2, x - w), top = Math.max(2, y - h);
  const right = Math.min(width - 2, x + w * 2), bottom = Math.min(height - 2, y + h * 2);
  const regionWidth = right - left, area = regionWidth * (bottom - top);
  if (area < 1 || area > 262144) return null;
  /** @param {number} col @param {number} row */
  const matches = (col, row) => {
    const pixel = color(col, row);
    return (pixel[3] ?? 0) >= 240 && distance(pixel, fill) <= 32;
  };
  let seed = -1;
  for (let row = y; row < y + h && seed < 0; row++) for (let col = x; col < x + w; col++) {
    if (matches(col, row)) { seed = (row - top) * regionWidth + col - left; break; }
  }
  if (seed < 0) return null;
  const queue = new Int32Array(area), visited = new Uint8Array(area);
  queue[0] = seed; visited[seed] = 1;
  let head = 0, tail = 1, minX = right, minY = bottom, maxX = left, maxY = top;
  while (head < tail) {
    const index = queue[head++] ?? 0, col = left + index % regionWidth, row = top + Math.floor(index / regionWidth);
    minX = Math.min(minX, col); maxX = Math.max(maxX, col);
    minY = Math.min(minY, row); maxY = Math.max(maxY, row);
    for (const [nx, ny] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]) {
      if (nx === undefined || ny === undefined || nx < left || nx >= right || ny < top || ny >= bottom) continue;
      const next = (ny - top) * regionWidth + nx - left;
      if (visited[next]) continue;
      visited[next] = 1;
      if (matches(nx, ny)) queue[tail++] = next;
    }
  }
  if (minX <= left || minY <= top || maxX >= right - 1 || maxY >= bottom - 1
    || maxX - minX + 1 > w * 2 || maxY - minY + 1 > h * 2) return null;
  x = minX; y = minY; w = maxX - minX + 1; h = maxY - minY + 1;
  const pixelBox = { x, y, w, h };
  const background = color(x - 2, y - 2);
  if ((background[3] ?? 0) < 240 || distance(background, fill) < 32) return null;
  let supported = 0, samples = 0;
  for (let col = x - 2; col <= x + w + 1; col++) for (const row of [y - 2, y + h + 1]) {
    const pixel = color(col, row); samples++;
    if ((pixel[3] ?? 0) >= 240 && distance(pixel, background) <= 24) supported++;
  }
  for (let row = y; row < y + h; row++) for (const col of [x - 2, x + w + 1]) {
    const pixel = color(col, row); samples++;
    if ((pixel[3] ?? 0) >= 240 && distance(pixel, background) <= 24) supported++;
  }
  if (supported / samples < 0.96) return null;
  let rectangleHits = 0, ellipseHits = 0, contourSamples = 0, filled = 0;
  for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
    const pixel = color(x + col, y + row), on = (pixel[3] ?? 0) >= 240 && distance(pixel, fill) <= 32;
    if (on) filled++;
    const nx = (col + 0.5 - w / 2) / (w / 2), ny = (row + 0.5 - h / 2) / (h / 2);
    const radial = nx * nx + ny * ny;
    // Interior marks can be reconstructed separately; only the outer contour
    // authorizes the base primitive, never a guessed semantic icon category.
    if (Math.abs(nx) < 0.75 && Math.abs(ny) < 0.75) continue;
    contourSamples++;
    if (on) rectangleHits++;
    if (on === (radial <= 1)) ellipseHits++;
  }
  if (filled / (w * h) < 0.6 || contourSamples === 0) return null;
  const rectangle = rectangleHits / contourSamples, ellipse = ellipseHits / contourSamples;
  if (rectangle >= 0.96) return { type: "rect", outlineAgreement: rectangle, pixelBox };
  if (ellipse >= 0.96) return { type: "ellipse", outlineAgreement: ellipse, pixelBox };
  return null;
}

module.exports = { sourceIconPrimitiveEvidence };
