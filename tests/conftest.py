import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRE = str(ROOT / "pipeline" / "preprocess")

sys.path.insert(0, PRE)
os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable
os.environ["PYTHONPATH"] = PRE + os.pathsep + os.environ.get("PYTHONPATH", "")