"""Compatibility wrapper for the core decorative-background inpainting tool."""

from pathlib import Path
import runpy


_CORE_SCRIPT = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "slideclone-core"
    / "python"
    / "inpaint-decorative-background.py"
)
globals().update(
    {
        name: value
        for name, value in runpy.run_path(str(_CORE_SCRIPT)).items()
        if not name.startswith("__")
    }
)


if __name__ == "__main__":
    main()
