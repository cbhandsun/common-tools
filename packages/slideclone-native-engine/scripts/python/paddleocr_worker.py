#!/usr/bin/env python3
"""Bounded JSON-lines bridge for the official PaddleOCR 3.x pipeline."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections.abc import Callable
from importlib import metadata
from pathlib import Path
from typing import Any

from paddleocr_protocol import JsonLineProtocol

PROTOCOL_VERSION = 2
MAX_REQUEST_BYTES = 64 * 1024
MAX_ITEMS = 20_000
MAX_BATCH_SIZE = 16


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--lang", default="ch")
    parser.add_argument("--ocr-version", default="PP-OCRv6")
    parser.add_argument("--device")
    parser.add_argument("--engine")
    parser.add_argument("--cpu-threads", type=int)
    parser.add_argument("--text-detection-model")
    parser.add_argument("--text-recognition-model")
    parser.add_argument("--text-detection-model-dir")
    parser.add_argument("--text-recognition-model-dir")
    parser.add_argument("--enable-hpi", action="store_true")
    parser.add_argument("--use-textline-orientation", action="store_true")
    return parser.parse_args()


def build_pipeline(args: argparse.Namespace) -> Any:
    from paddleocr import PaddleOCR  # Imported only inside the isolated worker.

    options: dict[str, Any] = {
        "lang": args.lang,
        "ocr_version": args.ocr_version,
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": args.use_textline_orientation,
    }
    optional = {
        "device": args.device,
        "engine": args.engine,
        "cpu_threads": args.cpu_threads,
        "text_detection_model_name": args.text_detection_model,
        "text_recognition_model_name": args.text_recognition_model,
        "text_detection_model_dir": args.text_detection_model_dir,
        "text_recognition_model_dir": args.text_recognition_model_dir,
    }
    options.update({key: value for key, value in optional.items() if value is not None})
    if args.enable_hpi:
        options["enable_hpi"] = True
    return PaddleOCR(**options)


def result_mapping(result: Any) -> dict[str, Any]:
    if isinstance(result, dict):
        payload = result
    else:
        payload = getattr(result, "json", None)
        if callable(payload):
            payload = payload()
        if not isinstance(payload, dict):
            payload = getattr(result, "res", None)
    if not isinstance(payload, dict):
        raise ValueError("unsupported-result")
    nested = payload.get("res")
    return nested if isinstance(nested, dict) else payload


def plain_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if hasattr(value, "tolist"):
        value = value.tolist()
    return value if isinstance(value, list) else []


def parse_results(results: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    word_hint_count = 0
    for result in results:
        payload = result_mapping(result)
        texts = plain_list(payload.get("rec_texts"))
        scores = plain_list(payload.get("rec_scores"))
        polygons = plain_list(payload.get("rec_polys")) or plain_list(payload.get("dt_polys"))
        orientations = plain_list(payload.get("textline_orientation_angles"))
        word_texts = plain_list(payload.get("text_word"))
        word_boxes = plain_list(payload.get("text_word_boxes"))
        for index, text in enumerate(texts):
            if not isinstance(text, str) or not text.strip() or index >= len(polygons):
                continue
            polygon = plain_list(polygons[index])
            item = {
                "text": text.strip(),
                "confidence": scores[index] if index < len(scores) else None,
                "polygon": [plain_list(point) for point in polygon],
                "orientation": orientations[index] if index < len(orientations) else None,
            }
            hints = word_position_hints(text.strip(), polygon,
                word_texts[index] if index < len(word_texts) else None,
                word_boxes[index] if index < len(word_boxes) else None,
                item["orientation"])
            if hints:
                word_hint_count += len(hints)
                if word_hint_count > MAX_ITEMS:
                    raise ValueError("item-limit")
                item["wordPositionHints"] = hints
            items.append(item)
            if len(items) > MAX_ITEMS:
                raise ValueError("item-limit")
    return items


def word_position_hints(text: str, polygon: object, words: object, boxes: object, orientation: object) -> list[dict[str, object]]:
    # Official word boxes are CTC estimates. Preserve only horizontal, ordered,
    # exact-sequence hints; never promote these to physical glyph ownership.
    points, content, regions = plain_list(polygon), plain_list(words), plain_list(boxes)
    if orientation not in (None, -1, 0) or len(points) != 4 or not 1 <= len(content) <= 512 or len(content) != len(regions):
        return []
    if any(not isinstance(word, str) or not word or len(word) > 512 or any(ord(char) < 32 or ord(char) == 127 for char in word) for word in content):
        return []
    if "".join(content) != text:
        return []
    corners = [plain_list(point) for point in points]
    if any(len(point) != 2 or any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in point) for point in corners):
        return []
    if corners[0][1] != corners[1][1] or corners[2][1] != corners[3][1] or corners[0][0] != corners[3][0] or corners[1][0] != corners[2][0]:
        return projected_word_position_hints(corners, content, regions)
    left, top, right, bottom = corners[0][0], corners[0][1], corners[2][0], corners[2][1]
    hints: list[dict[str, object]] = []
    previous = -math.inf
    for word, region in zip(content, regions):
        coordinates = plain_list(region)
        if len(coordinates) != 4 or any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in coordinates):
            return []
        x0, y0, x1, y1 = coordinates
        center = (x0 + x1) / 2
        if not (left <= x0 < x1 <= right and top <= y0 < y1 <= bottom and center > previous):
            return []
        previous = center
        hints.append({"text": word, "box": {"x": x0, "y": y0, "w": x1-x0, "h": y1-y0}})
    return hints


def projected_word_position_hints(corners: list[list[float]], content: list[str], regions: list[object]) -> list[dict[str, object]]:
    """Map validated PaddleX horizontal CTC cells back into their source quad.

    These remain proposals: source ink, neighbor ownership and native rotation
    admission are independently required downstream. No pixels are read here.
    """
    if any(value < 0 or value > 16384 for point in corners for value in point):
        return []
    crosses = [(corners[(i+1) % 4][0]-corners[i][0])*(corners[(i+2) % 4][1]-corners[(i+1) % 4][1])
               - (corners[(i+1) % 4][1]-corners[i][1])*(corners[(i+2) % 4][0]-corners[(i+1) % 4][0]) for i in range(4)]
    if not all(value > 0 for value in crosses):
        return []
    upper_left, upper_right, lower_right, lower_left = corners
    if upper_right[0] <= upper_left[0] or lower_right[0] <= lower_left[0] or lower_left[1] <= upper_left[1] or lower_right[1] <= upper_right[1]:
        return []
    # Match cal_ocr_word_box's existing vertical/horizontal branch exactly.
    width = max(point[0] for point in corners)-min(point[0] for point in corners)
    height = max(point[1] for point in corners)-min(point[1] for point in corners)
    if height > 1.5 * width:
        return []
    hints: list[dict[str, object]] = []
    previous = -math.inf
    for word, region in zip(content, regions):
        coordinates = plain_list(region)
        if len(coordinates) != 4 or any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in coordinates):
            return []
        x0, y0, x1, y1 = coordinates
        # Partial or unknown coordinate conventions cannot use this mapping.
        if not (upper_left[0] <= x0 < x1 <= upper_right[0] and y0 == upper_left[1] and y1 == lower_right[1]):
            return []
        u0, u1 = (x0-upper_left[0])/(upper_right[0]-upper_left[0]), (x1-upper_left[0])/(upper_right[0]-upper_left[0])
        points = [[a[c]+(b[c]-a[c])*u for c in range(2)] for a, b, u in
                  [(upper_left, upper_right, u0), (upper_left, upper_right, u1),
                   (lower_left, lower_right, u1), (lower_left, lower_right, u0)]]
        left, top = min(point[0] for point in points), min(point[1] for point in points)
        right, bottom = max(point[0] for point in points), max(point[1] for point in points)
        center = (left+right)/2
        if right <= left or bottom <= top or center <= previous:
            return []
        previous = center
        hints.append({"text": word, "box": {"x": left, "y": top, "w": right-left, "h": bottom-top}})
    return hints


def safe_version(package: str) -> str:
    try:
        return metadata.version(package)
    except metadata.PackageNotFoundError:
        return "unknown"


def valid_request(value: Any) -> tuple[str, list[str]]:
    if not isinstance(value, dict) or not isinstance(value.get("id"), str):
        raise ValueError("invalid-request")
    request_id = value["id"]
    image_paths = value.get("imagePaths")
    if len(request_id) > 128 or not isinstance(image_paths, list) or not 1 <= len(image_paths) <= MAX_BATCH_SIZE:
        raise ValueError("invalid-request")
    resolved_paths: list[str] = []
    for image_path in image_paths:
        if not isinstance(image_path, str) or len(image_path) > 32_768:
            raise ValueError("invalid-request")
        resolved = Path(image_path).resolve(strict=True)
        if not resolved.is_file():
            raise ValueError("invalid-input")
        resolved_paths.append(os.fspath(resolved))
    return request_id, resolved_paths


def serve(emit: Callable[[dict[str, object]], None]) -> int:
    try:
        args = parse_args()
        pipeline = build_pipeline(args)
    except Exception as error:
        emit({"type": "fatal", "code": "initialization-failed", "errorType": type(error).__name__})
        return 2

    emit({
        "type": "ready",
        "protocolVersion": PROTOCOL_VERSION,
        "paddleocrVersion": safe_version("paddleocr"),
        "paddlepaddleVersion": safe_version("paddlepaddle"),
    })
    for raw_line in sys.stdin.buffer:
        if len(raw_line) > MAX_REQUEST_BYTES:
            emit({"type": "error", "id": None, "code": "request-too-large"})
            continue
        request_id: str | None = None
        try:
            value = json.loads(raw_line.decode("utf-8"))
            request_id, image_paths = valid_request(value)
            predictions = pipeline.predict(image_paths, return_word_box=True)
            items_by_image = [parse_results([prediction]) for prediction in predictions]
            if len(items_by_image) != len(image_paths):
                raise ValueError("result-count")
            emit({"type": "result", "id": request_id, "itemsByImage": items_by_image})
        except Exception as error:
            emit({"type": "error", "id": request_id, "code": "inference-failed", "errorType": type(error).__name__})
    return 0


def main() -> int:
    try:
        protocol = JsonLineProtocol()
    except Exception:
        # Isolation failed: do not import libraries or run their shutdown hooks.
        os._exit(2)
    try:
        return serve(protocol.emit)
    finally:
        protocol.close()


if __name__ == "__main__":
    raise SystemExit(main())
