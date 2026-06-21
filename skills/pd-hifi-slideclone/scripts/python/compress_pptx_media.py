#!/usr/bin/env python
"""Optimize raster media inside a PPTX package without changing slide XML."""

from __future__ import annotations

import argparse
import io
import json
import shutil
import zipfile
from pathlib import Path

try:
    from PIL import Image
except Exception as exc:  # pragma: no cover - exercised in environments without Pillow.
    Image = None
    PIL_IMPORT_ERROR = str(exc)
else:
    PIL_IMPORT_ERROR = None


MEDIA_PREFIX = "ppt/media/"
IMAGE_EXTS = {".png", ".jpg", ".jpeg"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Optimize PPTX raster media parts.")
    parser.add_argument("--pptx", required=True, help="Input PPTX file")
    parser.add_argument("--out", required=True, help="Optimized PPTX output file")
    parser.add_argument("--report", required=True, help="JSON report file")
    parser.add_argument("--jpeg-quality", type=int, default=88)
    parser.add_argument("--png-compress-level", type=int, default=9)
    parser.add_argument("--max-image-pixels", type=int, default=0)
    parser.add_argument("--min-saving-bytes", type=int, default=128)
    return parser.parse_args()


def is_media_image(name: str) -> bool:
    suffix = Path(name).suffix.lower()
    return name.startswith(MEDIA_PREFIX) and suffix in IMAGE_EXTS


def optimize_image(name: str, data: bytes, args: argparse.Namespace) -> tuple[bytes, dict]:
    item = {
        "name": name,
        "originalBytes": len(data),
        "compressedBytes": len(data),
        "changed": False,
        "format": None,
        "widthPx": None,
        "heightPx": None,
        "actions": [],
        "skippedReason": None,
    }
    if Image is None:
        item["skippedReason"] = f"Pillow is not available: {PIL_IMPORT_ERROR}"
        return data, item

    try:
        with Image.open(io.BytesIO(data)) as img:
            item["format"] = img.format
            item["widthPx"], item["heightPx"] = img.size
            optimized_img = img.copy()
    except Exception as exc:
        item["skippedReason"] = f"Image decode failed: {exc}"
        return data, item

    if args.max_image_pixels and optimized_img.width * optimized_img.height > args.max_image_pixels:
        scale = (args.max_image_pixels / float(optimized_img.width * optimized_img.height)) ** 0.5
        new_size = (
            max(1, int(optimized_img.width * scale)),
            max(1, int(optimized_img.height * scale)),
        )
        optimized_img = optimized_img.resize(new_size, Image.Resampling.LANCZOS)
        item["actions"].append({
            "type": "downsample",
            "from": [item["widthPx"], item["heightPx"]],
            "to": list(new_size),
        })

    suffix = Path(name).suffix.lower()
    output = io.BytesIO()
    try:
        if suffix == ".png":
            optimized_img.save(
                output,
                format="PNG",
                optimize=True,
                compress_level=max(0, min(9, args.png_compress_level)),
            )
            item["actions"].append({"type": "png-optimize"})
        else:
            if optimized_img.mode not in ("RGB", "L"):
                optimized_img = optimized_img.convert("RGB")
            optimized_img.save(
                output,
                format="JPEG",
                quality=max(1, min(95, args.jpeg_quality)),
                optimize=True,
                progressive=True,
            )
            item["actions"].append({"type": "jpeg-resave", "quality": args.jpeg_quality})
    except Exception as exc:
        item["skippedReason"] = f"Image encode failed: {exc}"
        return data, item

    optimized = output.getvalue()
    saving = len(data) - len(optimized)
    if saving >= args.min_saving_bytes:
        item["compressedBytes"] = len(optimized)
        item["changed"] = True
        if optimized_img.size != (item["widthPx"], item["heightPx"]):
            item["compressedWidthPx"], item["compressedHeightPx"] = optimized_img.size
        return optimized, item

    item["actions"] = []
    item["skippedReason"] = f"Saving {saving} bytes is below minSavingBytes={args.min_saving_bytes}"
    return data, item


def copy_or_optimize_package(args: argparse.Namespace) -> dict:
    input_file = Path(args.pptx)
    output_file = Path(args.out)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    media_items = []
    original_bytes = input_file.stat().st_size
    with zipfile.ZipFile(input_file, "r") as zin, zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as zout:
      for info in zin.infolist():
          data = zin.read(info.filename)
          if is_media_image(info.filename):
              data, item = optimize_image(info.filename, data, args)
              media_items.append(item)
          zout.writestr(info, data)

    compressed_bytes = output_file.stat().st_size
    changed_items = [item for item in media_items if item.get("changed")]
    if not changed_items and compressed_bytes >= original_bytes:
        shutil.copyfile(input_file, output_file)
        compressed_bytes = output_file.stat().st_size

    return {
        "provider": "compress-pptx-media",
        "pptxFile": str(input_file),
        "compressedPptxFile": str(output_file),
        "originalBytes": original_bytes,
        "compressedBytes": compressed_bytes,
        "savedBytes": original_bytes - compressed_bytes,
        "savedRatio": 0 if original_bytes == 0 else (original_bytes - compressed_bytes) / original_bytes,
        "mediaCount": len(media_items),
        "changedMediaCount": len(changed_items),
        "media": media_items,
        "actions": [
            "Optimized PNG/JPEG parts under ppt/media.",
            "Preserved slide XML and editable Office objects.",
            "Skipped replacements that did not meet the minimum byte saving.",
        ],
    }


def main() -> None:
    args = parse_args()
    report = copy_or_optimize_package(args)
    report_file = Path(args.report)
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
