"""Start the integrated Nexora.AI product and local agentic runtime."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / "agent_runtime"

if str(RUNTIME) not in sys.path:
    sys.path.insert(0, str(RUNTIME))
os.chdir(RUNTIME)

from start import main  # noqa: E402

if __name__ == "__main__":
    main()
