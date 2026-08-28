#!/usr/bin/env python3
"""Normalize a bounded raster input to RGB PNG for native slide reconstruction."""

import argparse
from pathlib import Path

from PIL import Image, ImageOps

MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_DIMENSION = 16_384
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def bounded_positive(value: str) -> int:
    number = int(value)
    if number < 1 or number > MAX_DIMENSION:
        raise argparse.ArgumentTypeError("image dimension is outside the processing boundary")
    return number


def main() -> None:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", required=True, type=bounded_positive)
    parser.add_argument("--height", required=True, type=bounded_positive)
    args = parser.parse_args()
    source = Path(args.input).resolve(strict=True)
    destination = Path(args.output).resolve()
    if not source.is_file() or source.stat().st_size < 4 or source.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("input image is outside the processing boundary")
    if args.width * args.height > MAX_PIXELS:
        raise ValueError("input image pixel count is outside the processing boundary")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as probe:
        probe.verify()
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        if image.size != (args.width, args.height):
            raise ValueError("input image dimensions do not match the validated package")
        image.convert("RGB").save(destination, format="PNG", optimize=False)
    if not destination.is_file() or destination.stat().st_size < 24:
        raise RuntimeError("PNG normalizer did not produce an output")


if __name__ == "__main__":
    main()
