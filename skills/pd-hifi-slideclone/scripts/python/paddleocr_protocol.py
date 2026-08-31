"""Private JSON-lines output for a dedicated, process-lifetime OCR worker.

Libraries may write via Python, the CRT, Win32, or subprocesses. Ordinary
stdout/stderr stay redirected even during interpreter shutdown; only emit()
owns the original protocol pipe. Never use this in an embedding application.
"""
from __future__ import annotations

import json
import os


def redirect_library_output() -> None:
    with open(os.devnull, "wb", buffering=0) as sink:
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)
    if os.name == "nt":
        import ctypes
        import msvcrt

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.SetStdHandle.argtypes = [ctypes.c_ulong, ctypes.c_void_p]
        kernel.SetStdHandle.restype = ctypes.c_int
        for standard, descriptor in ((-11, 1), (-12, 2)):
            if not kernel.SetStdHandle(standard, msvcrt.get_osfhandle(descriptor)):
                raise OSError("standard-output-isolation-failed")


class JsonLineProtocol:
    def __init__(self) -> None:
        descriptor = os.dup(1)
        try:
            os.set_inheritable(descriptor, False)
            self._stream = os.fdopen(descriptor, "w", encoding="utf-8", newline="\n")
        except BaseException:
            os.close(descriptor)
            raise
        try:
            redirect_library_output()
        except BaseException:
            self._stream.close()
            raise

    def emit(self, payload: dict[str, object]) -> None:
        self._stream.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
        self._stream.flush()

    def close(self) -> None:
        self._stream.close()
