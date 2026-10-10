import os
import sys

os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable

from pyspark.sql import SparkSession


def test_docs_load_in_spark():
    spark = SparkSession.builder.master("local[*]").appName("t2").getOrCreate()
    df = spark.read.json("data/clean/docs.jsonl")
    assert df.count() > 1000
    assert set(df.columns) >= {"id", "title", "text", "category", "url"}
    spark.stop()