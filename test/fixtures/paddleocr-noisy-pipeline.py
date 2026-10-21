"""Exercise the real worker protocol without importing PaddleOCR or downloading models."""
import atexit
import ctypes
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

mode, worker_path = sys.argv[1:3]
sys.path.insert(0, str(Path(worker_path).parent))
spec = importlib.util.spec_from_file_location("tested_paddle_worker", worker_path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def isolation_failure(*_args, **_kwargs):
    raise OSError("PRIVATE_FIXTURE_SETUP_ERROR")


if mode.startswith("setup-failure-"):
    import paddleocr_protocol
    operation = mode.removeprefix("setup-failure-")
    if operation == "redirect":
        paddleocr_protocol.redirect_library_output = isolation_failure
    else:
        setattr(paddleocr_protocol.os, operation, isolation_failure)


def noise():
    if mode == "quiet":
        return
    print("PRIVATE_FIXTURE_PYTHON_LOG", flush=True)
    print("PRIVATE_FIXTURE_STDERR", file=sys.stderr, flush=True)
    os.write(1, b'PRIVATE_FIXTURE_NATIVE_LOG\n{"type":"ready","protocolVersion":999}\n')
    os.write(2, b"PRIVATE_FIXTURE_NATIVE_STDERR\n")
    if os.name == "nt":
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.GetStdHandle.argtypes = [ctypes.c_ulong]
        kernel.GetStdHandle.restype = ctypes.c_void_p
        kernel.WriteFile.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p]
        kernel.WriteFile.restype = ctypes.c_int
        payload = b"PRIVATE_FIXTURE_WIN32_LOG\n"
        written = ctypes.c_ulong()
        if not kernel.WriteFile(kernel.GetStdHandle(-11), payload, len(payload), ctypes.byref(written), None):
            raise OSError("native fixture write failed")


class Pipeline:
    def predict(self, paths, *, return_word_box):
        assert return_word_box is True
        noise()
        if mode == "inference-failure":
            raise RuntimeError("PRIVATE_FIXTURE_INFERENCE_ERROR")
        for _ in paths:
            noise()  # Also exercise output from lazy prediction iteration.
            words = ["中", "文", " 🌍"]
            boxes = [[0, 0, 6, 10], [6, 0, 12, 10], [12, 0, 20, 10]]
            polygon = [[0, 0], [20, 0], [20, 10], [0, 10]]
            orientation = None
            if mode.startswith("word-quad-"):
                polygon = [[10, 10], [30, 12], [32, 22], [12, 20]]
                boxes = [[10, 10, 16, 22], [16, 10, 22, 22], [22, 10, 30, 22]]
                if mode == "word-quad-partial":
                    boxes[0][1] = 11
                elif mode == "word-quad-crossed":
                    polygon[2], polygon[3] = polygon[3], polygon[2]
                elif mode == "word-quad-vertical":
                    polygon = [[10, 10], [14, 11], [16, 40], [12, 39]]
                elif mode == "word-quad-rotated":
                    orientation = 180
                elif mode == "word-quad-boolean":
                    polygon[0][0] = True
                elif mode == "word-quad-overflow":
                    polygon[0][0] = 1e308
                elif mode == "word-quad-reversed":
                    boxes.reverse()
                elif mode == "word-quad-empty":
                    words, boxes = [], []
                elif mode == "word-quad-nonfinite":
                    polygon[0][0] = float("inf")
                elif mode == "word-quad-invalid-region":
                    boxes[1][0] = float("nan")
                elif mode == "word-quad-descending":
                    polygon = [[10, 12], [30, 10], [32, 20], [12, 22]]
                    boxes = [[10, 12, 16, 20], [16, 12, 22, 20], [22, 12, 30, 20]]
                elif mode == "word-quad-count-limit":
                    words, boxes = ["x"] * 513, [[10, 10, 30, 22]] * 513
            if mode == "word-sequence-mismatch":
                words[0] = "PRIVATE_FIXTURE_WORD"
            elif mode == "word-invalid-coordinate":
                boxes[0][0] = float("nan")
            elif mode == "word-outside-line":
                boxes[0][0] = -1
            elif mode == "word-invalid-count":
                boxes.pop()
            yield {"rec_texts": [] if mode == "empty" else ["中文 🌍"],
                   "rec_scores": [0.99], "rec_polys": [polygon], "textline_orientation_angles": [orientation],
                   "text_word": [words], "text_word_boxes": [boxes]}


def build_pipeline(_args):
    noise()
    subprocess.run([sys.executable, "-c", "print('PRIVATE_FIXTURE_CHILD_LOG')"], check=True, close_fds=False)
    if mode == "initialization-failure":
        raise RuntimeError("PRIVATE_FIXTURE_INITIALIZATION_ERROR")
    return Pipeline()


worker.build_pipeline = build_pipeline
worker.safe_version = lambda _package: "fixture"
sys.argv = ["worker"]
atexit.register(noise)
if mode == "lifecycle":
    protocol = worker.JsonLineProtocol()
    assert not os.get_inheritable(protocol._stream.fileno())
    protocol.emit({"type": "lifecycle"})
    protocol.close()
    protocol.close()
    try:
        protocol.emit({"type": "after-close"})
    except ValueError:
        pass
    else:
        raise AssertionError("closed protocol accepted output")
    raise SystemExit(0)
raise SystemExit(worker.main())
