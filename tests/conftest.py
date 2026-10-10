import os
import sys

# Make Spark workers use the same Python that is running pytest
os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable