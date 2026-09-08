#!/usr/bin/env python3
"""Bounded JSON-lines bridge for the official PaddleOCR 3.x pipeline."""

from __future__ import annotations

import argparse
import json
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
    for result in results:
        payload = result_mapping(result)
        texts = plain_list(payload.get("rec_texts"))
        scores = plain_list(payload.get("rec_scores"))
        polygons = plain_list(payload.get("rec_polys")) or plain_list(payload.get("dt_polys"))
        orientations = plain_list(payload.get("textline_orientation_angles"))
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
            items.append(item)
            if len(items) > MAX_ITEMS:
                raise ValueError("item-limit")
    return items


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
            predictions = pipeline.predict(image_paths)
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
