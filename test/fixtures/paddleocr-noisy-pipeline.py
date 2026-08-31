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
    def predict(self, paths):
        noise()
        if mode == "inference-failure":
            raise RuntimeError("PRIVATE_FIXTURE_INFERENCE_ERROR")
        for _ in paths:
            noise()  # Also exercise output from lazy prediction iteration.
            yield {"rec_texts": [] if mode == "empty" else ["中文 🌍"],
                   "rec_scores": [0.99], "rec_polys": [[[0, 0], [20, 0], [20, 10], [0, 10]]]}


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
