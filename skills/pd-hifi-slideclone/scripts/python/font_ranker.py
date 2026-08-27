#!/usr/bin/env python
"""Cheap local font candidate ranking for slide clone text boxes.

This is intentionally a pre-filter, not the final fidelity judge. It uses
Pillow to render text candidates into the target box and compares text ink
geometry against the source crop so PowerPoint only verifies a small shortlist.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception as exc:  # pragma: no cover - exercised by smoke environments.
    PIL_IMPORT_ERROR = str(exc)
    Image = None
    ImageDraw = None
    ImageFont = None
else:
    PIL_IMPORT_ERROR = None


FONT_ALIASES = {
    "arial": {"regular": ["arial.ttf"], "bold": ["arialbd.ttf"]},
    "dengxian": {"regular": ["Deng.ttf", "Dengl.ttf"], "bold": ["Dengb.ttf"]},
    "microsoftyahei": {"regular": ["msyh.ttc"], "bold": ["msyhbd.ttc", "msyh.ttc"]},
    "simhei": {"regular": ["simhei.ttf"], "bold": ["simhei.ttf"]},
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    payload = read_json(Path(args.input))
    out_file = Path(args.out)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    if PIL_IMPORT_ERROR:
        write_json(out_file, {"ok": False, "error": f"Pillow is not available: {PIL_IMPORT_ERROR}"})
        return 0

    result = rank_payload(payload)
    write_json(out_file, result)
    print(json.dumps({"ok": result["ok"], "out": str(out_file)}, ensure_ascii=False))
    return 0


def rank_payload(payload: dict[str, Any]) -> dict[str, Any]:
    ir = payload.get("ir") or {}
    base_dir = Path(payload.get("baseDir") or ".")
    options_by_role = payload.get("optionsByRole") or []
    top_n = max(1, int(payload.get("topN") or 2))
    warnings: list[str] = []
    rankings: dict[str, list[dict[str, Any]]] = {}

    pages = ir.get("pages") or []
    for role_entry in options_by_role:
        role = canonical_role(str(role_entry.get("role") or "body"))
        options = role_entry.get("options") or []
        boxes = collect_role_boxes(pages, role)
        scored: list[dict[str, Any]] = []
        for option in options:
            score, detail = score_option(ir, boxes, option, warnings, base_dir)
            scored.append({"option": option, "score": round(score, 6), "detail": detail})
        scored.sort(key=lambda item: item["score"])
        rankings[role] = scored[:top_n]

    return {
        "ok": True,
        "provider": "pillow-font-geometry-ranker",
        "topN": top_n,
        "rankings": rankings,
        "warnings": warnings[:50],
    }


def score_option(ir: dict[str, Any], boxes: list[dict[str, Any]], option: dict[str, Any], warnings: list[str], base_dir: Path) -> tuple[float, dict[str, Any]]:
    if not boxes:
        return 1_000_000.0, {"reason": "no boxes for role"}

    family = str(option.get("family") or "")
    weight = str(option.get("weight") or "regular")
    font_file = resolve_font_file(family, weight)
    if font_file is None:
        warnings.append(f"Font file not found for family={family} weight={weight}.")
        return 999_000.0, {"reason": "font missing", "family": family, "weight": weight}

    total = 0.0
    counted = 0
    for item in boxes:
        page = item["page"]
        box = item["box"]
        text_box = item["textBox"]
        source_image = resolve_path(page.get("sourceImage"), base_dir)
        if source_image is None or not source_image.exists():
            continue
        try:
            source = Image.open(source_image).convert("RGBA")
            crop = crop_slide_box(source, box, ir.get("slideSize") or {})
            source_ink = find_ink_bounds(crop)
            if source_ink is None:
                continue
            rendered = render_text_candidate(
                text=str(text_box.get("text") or ""),
                width=crop.width,
                height=crop.height,
                font_file=font_file,
                size_px=font_size_px(text_box, option, source, ir.get("slideSize") or {}),
                bold=weight.lower() == "bold",
                align=str((text_box.get("font") or {}).get("align") or "left"),
            )
            rendered_ink = find_ink_bounds(rendered)
            if rendered_ink is None:
                total += 100.0
                counted += 1
                continue
            total += geometry_score(source_ink, rendered_ink, crop.size)
            counted += 1
        except Exception as exc:
            warnings.append(f"Font rank failed for {text_box.get('id')}: {exc}")

    if counted == 0:
        return 998_000.0, {"reason": "no comparable crops", "fontFile": font_file}
    return total / counted, {"boxCount": counted, "fontFile": font_file}


def collect_role_boxes(pages: list[dict[str, Any]], role: str) -> list[dict[str, Any]]:
    boxes: list[dict[str, Any]] = []
    for page in pages:
        for text_box in page.get("textBoxes") or []:
            if normalize_text_role(text_box) != role:
                continue
            box = text_box.get("box") or {}
            if not all(is_number(box.get(key)) for key in ("x", "y", "w", "h")):
                continue
            boxes.append({"page": page, "textBox": text_box, "box": box})
    return boxes


def crop_slide_box(source: Any, box: dict[str, float], slide_size: dict[str, float]) -> Any:
    width_pt = float(slide_size.get("widthPt") or 960)
    height_pt = float(slide_size.get("heightPt") or 540)
    x = max(0, int(round(float(box["x"]) * source.width / width_pt)))
    y = max(0, int(round(float(box["y"]) * source.height / height_pt)))
    w = max(1, int(round(float(box["w"]) * source.width / width_pt)))
    h = max(1, int(round(float(box["h"]) * source.height / height_pt)))
    return source.crop((x, y, min(source.width, x + w), min(source.height, y + h)))


def font_size_px(text_box: dict[str, Any], option: dict[str, Any], source: Any, slide_size: dict[str, float]) -> int:
    font = text_box.get("font") or {}
    size_pt = float(font.get("sizePt") or 18) + float(option.get("sizeAdjustPt") or 0)
    height_pt = float(slide_size.get("heightPt") or 540)
    px = size_pt * source.height / max(1.0, height_pt)
    return max(1, int(round(px)))


def render_text_candidate(text: str, width: int, height: int, font_file: str, size_px: int, bold: bool, align: str) -> Any:
    image = Image.new("RGBA", (max(1, width), max(1, height)), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(font_file, size_px)
    lines = text.splitlines() or [text]
    line_gap = max(1, int(size_px * 0.18))
    y = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        text_w = bbox[2] - bbox[0]
        if align == "center":
            x = max(0, (width - text_w) // 2)
        elif align == "right":
            x = max(0, width - text_w)
        else:
            x = 0
        draw.text((x, y), line, font=font, fill=(0, 0, 0, 255))
        if bold:
            draw.text((x + 1, y), line, font=font, fill=(0, 0, 0, 220))
        y += max(1, bbox[3] - bbox[1]) + line_gap
    return image


def find_ink_bounds(image: Any) -> tuple[int, int, int, int] | None:
    pixels = image.load()
    background = estimate_background(image)
    min_x = image.width
    min_y = image.height
    max_x = -1
    max_y = -1
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a < 24:
                continue
            bg_delta = abs(r - background[0]) + abs(g - background[1]) + abs(b - background[2])
            brightness = (r + g + b) / 3
            contrast = max(r, g, b) - min(r, g, b)
            if bg_delta <= 60 and not (brightness < 80 or contrast > 90):
                continue
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    if max_x < min_x or max_y < min_y:
        return None
    return (min_x, min_y, max_x - min_x + 1, max_y - min_y + 1)


def estimate_background(image: Any) -> tuple[int, int, int]:
    samples: list[tuple[int, int, int]] = []
    points = [
        (0, 0),
        (max(0, image.width - 1), 0),
        (0, max(0, image.height - 1)),
        (max(0, image.width - 1), max(0, image.height - 1)),
        (image.width // 2, image.height // 2),
    ]
    pixels = image.load()
    for x, y in points:
        r, g, b, a = pixels[x, y]
        if a >= 24:
            samples.append((r, g, b))
    if not samples:
        return (255, 255, 255)
    return tuple(sorted(channel)[len(channel) // 2] for channel in zip(*samples))


def geometry_score(source: tuple[int, int, int, int], rendered: tuple[int, int, int, int], size: tuple[int, int]) -> float:
    width, height = max(1, size[0]), max(1, size[1])
    sx, sy, sw, sh = source
    rx, ry, rw, rh = rendered
    source_center = ((sx + sw / 2) / width, (sy + sh / 2) / height)
    rendered_center = ((rx + rw / 2) / width, (ry + rh / 2) / height)
    source_size = (sw / width, sh / height)
    rendered_size = (rw / width, rh / height)
    overflow = max(0.0, (rx + rw - width) / width) + max(0.0, (ry + rh - height) / height)
    return (
        abs(source_size[0] - rendered_size[0]) * 2.2
        + abs(source_size[1] - rendered_size[1]) * 2.8
        + abs(source_center[0] - rendered_center[0]) * 0.8
        + abs(source_center[1] - rendered_center[1]) * 1.2
        + overflow * 8.0
    )


def resolve_font_file(family: str, weight: str) -> str | None:
    fonts_dir = Path(os.environ.get("WINDIR", "C:\\Windows")) / "Fonts"
    family_key = normalize_font_name(family)
    weight_key = "bold" if str(weight).lower() == "bold" else "regular"
    for name in FONT_ALIASES.get(family_key, {}).get(weight_key, []):
        candidate = fonts_dir / name
        if candidate.exists():
            return str(candidate)
    for file in fonts_dir.glob("*"):
        if file.suffix.lower() not in {".ttf", ".ttc", ".otf"}:
            continue
        if family_key and family_key in normalize_font_name(file.stem):
            return str(file)
    return None


def resolve_path(value: Any, base_dir: Path) -> Path | None:
    if not value:
        return None
    file = Path(str(value))
    if file.is_absolute():
        return file
    return base_dir / file


def normalize_text_role(text_box: dict[str, Any]) -> str:
    explicit = str(text_box.get("role") or "").strip().lower()
    if explicit:
        return canonical_role(explicit)
    return infer_role_from_id(str(text_box.get("id") or ""))


def canonical_role(role: str) -> str:
    if role in {"heading", "headline"}:
        return "title"
    if role in {"card", "card-heading"}:
        return "card-title"
    if role in {"cta", "button-label"}:
        return "button"
    if role in {"subtitle", "note", "description"}:
        return "caption"
    return role or "body"


def infer_role_from_id(value: str) -> str:
    text = value.lower()
    if not text:
        return "body"
    if "card-title" in text or "engine-title" in text:
        return "card-title"
    if text == "title" or re.search(r"(^|-)title$", text):
        return "title"
    if "banner" in text:
        return "banner"
    if "button" in text or "portal-text" in text:
        return "button"
    if "caption" in text or "note" in text or "desc" in text:
        return "caption"
    return "body"


def normalize_font_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def read_json(file: Path) -> dict[str, Any]:
    return json.loads(file.read_text(encoding="utf-8"))


def write_json(file: Path, data: dict[str, Any]) -> None:
    file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
