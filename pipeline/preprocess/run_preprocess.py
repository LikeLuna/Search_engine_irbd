"""Apply preprocessing to every document with Spark and save tokens."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRE = str(ROOT / "pipeline" / "preprocess")
sys.path.insert(0, PRE)
os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable
os.environ["PYTHONPATH"] = PRE + os.pathsep + os.environ.get("PYTHONPATH", "")

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import ArrayType, StringType

from text_processing import preprocess

DOCS = ROOT / "data" / "clean" / "docs.jsonl"
OUT = ROOT / "data" / "clean" / "tokens.jsonl"


def main() -> None:
    spark = (SparkSession.builder.master("local[*]")
             .appName("preprocess").getOrCreate())
    spark.sparkContext.setLogLevel("ERROR")

    preprocess_udf = F.udf(preprocess, ArrayType(StringType()))

    df = spark.read.json(str(DOCS))
    df = df.withColumn("tokens",
                       preprocess_udf(F.concat_ws(" ", "title", "text")))
    df = df.withColumn("n_tokens", F.size("tokens")).cache()

    # --- save tokens (plain Python write avoids Windows winutils issues)
    with OUT.open("w", encoding="utf-8") as f:
        for row in df.select("id", "tokens").toLocalIterator():
            f.write(json.dumps({"id": row["id"], "tokens": row["tokens"]}) + "\n")

    # --- statistics
    n_docs = df.count()
    avg_len = df.agg(F.avg("n_tokens")).first()[0]
    terms = df.select(F.explode("tokens").alias("term"))
    vocab = terms.distinct().count()
    print(f"\nDocuments:          {n_docs}")
    print(f"Avg tokens per doc: {avg_len:.1f}")
    print(f"Vocabulary size:    {vocab}")
    print("\nTop 15 terms:")
    terms.groupBy("term").count().orderBy(F.desc("count")).show(15, False)
    print(f"Saved tokens to {OUT}")
    spark.stop()


if __name__ == "__main__":
    main()