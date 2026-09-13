"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { writePng } = require("../packages/slideclone-core/png");
const {
  comparePerceptualImages,
  hammingDistance,
  hashBitsToHex,
  normalizePngImage,
  perceptualHashBits,
  sampleGrayscale,
  structuralSimilarity
} = require("../packages/slideclone-core/perceptual-image-quality");

function makeGradientImage(width = 32, height = 32) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = Math.round((x / Math.max(1, width - 1)) * 255);
      rgba[offset + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      rgba[offset + 2] = 128;
      rgba[offset + 3] = 255;
    }
  }
  return { width, height, rgba };
}

function cloneImage(image) {
  return { width: image.width, height: image.height, rgba: Buffer.from(image.rgba) };
}

function invertCenterPatch(image) {
  const next = cloneImage(image);
  for (let y = 10; y < 22; y += 1) {
    for (let x = 10; x < 22; x += 1) {
      const offset = (y * next.width + x) * 4;
      next.rgba[offset] = 255 - next.rgba[offset];
      next.rgba[offset + 1] = 255 - next.rgba[offset + 1];
      next.rgba[offset + 2] = 255 - next.rgba[offset + 2];
    }
  }
  return next;
}

test("comparePerceptualImages passes identical images with stable hash and SSIM", () => {
  const image = makeGradientImage();
  const result = comparePerceptualImages(image, cloneImage(image));

  assert.equal(result.passed, true);
  assert.equal(result.ssim, 1);
  assert.equal(result.phashDistance, 0);
  assert.equal(result.referenceHash, result.candidateHash);
});

test("comparePerceptualImages rejects materially different images", () => {
  const image = makeGradientImage();
  const changed = invertCenterPatch(image);
  const result = comparePerceptualImages(image, changed, { minSsim: 0.99, maxPhashDistance: 0 });

  assert.equal(result.passed, false);
  assert.ok(result.ssim < 0.99);
  assert.ok(result.phashDistance >= 0);
});

test("perceptual image helpers validate inputs and support PNG files", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "perceptual-quality-"));
  try {
    const image = makeGradientImage(8, 8);
    const file = path.join(tmpDir, "image.png");
    writePng(file, image);

    const loaded = normalizePngImage(file);
    assert.equal(loaded.width, 8);
    assert.equal(loaded.height, 8);
    assert.equal(structuralSimilarity(image, loaded), 1);

    const hash = perceptualHashBits(loaded);
    assert.equal(hash.length, 63);
    assert.equal(hammingDistance(hash, hash), 0);

    assert.throws(() => normalizePngImage({ width: 1, height: 1, rgba: Buffer.alloc(3) }), /rgba length is invalid/);
    assert.throws(() => comparePerceptualImages(image, image, []), /options must be an object/);
    assert.throws(() => comparePerceptualImages(image, image, { minSsim: 2 }), /minSsim must be a number between 0 and 1/);
    assert.throws(() => comparePerceptualImages(image, image, { maxPhashDistance: 64 }), /maxPhashDistance must be an integer/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("perceptual helper boundaries reject invalid samples and hash bits", () => {
  const image = makeGradientImage(4, 4);

  assert.equal(sampleGrayscale(image, 2, 2).length, 4);
  assert.throws(() => sampleGrayscale(image, 0, 2), /sample width must be an integer between 1 and 4096/);
  assert.throws(() => sampleGrayscale(image, 2, 4097), /sample height must be an integer between 1 and 4096/);
  assert.throws(() => hammingDistance([true], [true, false]), /equal length/);
  assert.throws(() => hammingDistance([true, "private-token"], [true, false]), (error) => {
    assert.match(error.message, /left hash bits\[1\] must be a boolean/);
    assert.equal(error.message.includes("private-token"), false);
    return true;
  });
  assert.throws(() => hashBitsToHex([]), /hash bits length must be between 1 and 4096/);
  assert.equal(hashBitsToHex([true, false, true, false]), "a");
});
