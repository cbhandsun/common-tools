"""Remove rasterized text from decorative slide backgrounds.

The adapter limits detection to validated OCR boxes, extracts glyph-like
high-frequency pixels, then applies biharmonic inpainting only to that mask.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.restoration import inpaint


MAX_IMAGE_BYTES = 80 * 1024 * 1024
MAX_BOXES = 100


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--boxes", required=True)
    return parser.parse_args()


def load_boxes(raw: str, width: int, height: int) -> list[tuple[int, int, int, int]]:
    value = json.loads(raw)
    if not isinstance(value, list) or len(value) > MAX_BOXES:
        raise ValueError("boxes must be a JSON array with at most 100 items")
    boxes: list[tuple[int, int, int, int]] = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("each box must be an object")
        numbers = [item.get(key) for key in ("x", "y", "w", "h")]
        if any(not isinstance(number, (int, float)) or not np.isfinite(number) for number in numbers):
            raise ValueError("box coordinates must be finite numbers")
        x = max(0, min(width - 1, int(np.floor(numbers[0]))))
        y = max(0, min(height - 1, int(np.floor(numbers[1]))))
        right = max(x + 1, min(width, int(np.ceil(numbers[0] + numbers[2]))))
        bottom = max(y + 1, min(height, int(np.ceil(numbers[1] + numbers[3]))))
        boxes.append((x, y, right, bottom))
    return boxes


def glyph_mask(rgb: np.ndarray, boxes: list[tuple[int, int, int, int]]) -> np.ndarray:
    smooth = ndimage.gaussian_filter(rgb, sigma=(7.0, 7.0, 0.0))
    residual = np.linalg.norm(rgb - smooth, axis=2)
    luminance = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    mask = np.zeros(rgb.shape[:2], dtype=bool)
    for x1, y1, x2, y2 in boxes:
        region = residual[y1:y2, x1:x2]
        if region.size == 0:
            continue
        local_luminance = luminance[y1:y2, x1:x2]
        luminance_threshold = max(0.22, float(np.median(local_luminance) + 0.09))
        residual_threshold = max(0.025, float(np.percentile(region, 45)))
        local = (local_luminance >= luminance_threshold) & (region >= residual_threshold)
        local = ndimage.binary_closing(local, iterations=2)
        dilation = 24 if (y2 - y1) >= 90 else 10
        local = ndimage.binary_dilation(local, iterations=dilation)
        mask[y1:y2, x1:x2] |= local
    return mask


def main() -> None:
    args = parse_args()
    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    if not source.is_file() or source.stat().st_size > MAX_IMAGE_BYTES:
        raise ValueError("input image is missing or too large")
    image = Image.open(source).convert("RGB")
    rgb = np.asarray(image, dtype=np.float32) / 255.0
    boxes = load_boxes(args.boxes, image.width, image.height)
    mask = glyph_mask(rgb, boxes)
    repaired = inpaint.inpaint_biharmonic(rgb, mask, channel_axis=-1) if mask.any() else rgb
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(repaired * 255.0, 0, 255).astype(np.uint8), mode="RGB").save(output)
    print(json.dumps({"passed": True, "maskedPixels": int(mask.sum()), "boxes": len(boxes)}))


if __name__ == "__main__":
    main()
