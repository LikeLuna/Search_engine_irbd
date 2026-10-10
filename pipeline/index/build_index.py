"""Task 4: build the inverted index with Spark."""
import json
import os
import sys
from pathlib import Path

os.environ["PYSPARK_PYTHON"] = sys.executable
os.environ["PYSPARK_DRIVER_PYTHON"] = sys.executable

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "data" / "clean" / "docs.jsonl"
TOKENS = ROOT / "data" / "clean" / "tokens.jsonl"
OUT_DIR = ROOT / "data" / "index"
SNIPPET_CHARS = 300


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    spark = (SparkSession.builder.master("local[*]")
             .appName("build_index").getOrCreate())
    spark.sparkContext.setLogLevel("ERROR")

    df = spark.read.json(str(TOKENS))          # columns: id, tokens

    # 1. document lengths (number of tokens per document)
    lengths = df.select("id", F.size("tokens").alias("length"))

    # 2. term frequency: how often each term occurs in each document
    exploded = df.select("id", F.explode("tokens").alias("term"))
    tf = (exploded.groupBy("term", "id").count()
          .withColumnRenamed("count", "tf"))

    # 3. postings: group by term -> sorted list of (doc id, tf), plus df
    postings = (tf.groupBy("term")
                .agg(F.count("*").alias("df"),
                     F.sort_array(F.collect_list(F.struct("id", "tf")))
                     .alias("postings"))
                .orderBy("term"))

    # --- write postings (plain Python write avoids Windows winutils issues)
    n_terms = 0
    n_postings = 0
    with (OUT_DIR / "postings.jsonl").open("w", encoding="utf-8") as f:
        for row in postings.toLocalIterator():
            plist = [[p["id"], p["tf"]] for p in row["postings"]]
            f.write(json.dumps({"term": row["term"], "df": row["df"],
                                "postings": plist}) + "\n")
            n_terms += 1
            n_postings += len(plist)

    # --- collection statistics for TF-IDF and BM25
    doc_lengths = {str(r["id"]): r["length"] for r in lengths.collect()}
    n_docs = len(doc_lengths)
    avgdl = sum(doc_lengths.values()) / n_docs
    stats = {"N": n_docs, "avgdl": avgdl, "doc_lengths": doc_lengths}
    (OUT_DIR / "stats.json").write_text(json.dumps(stats), encoding="utf-8")

    # --- document metadata for the UI
    with DOCS.open(encoding="utf-8") as src, \
            (OUT_DIR / "docs_meta.jsonl").open("w", encoding="utf-8") as dst:
        for line in src:
            d = json.loads(line)
            dst.write(json.dumps({
                "id": d["id"], "title": d["title"],
                "category": d["category"], "url": d["url"],
                "snippet": d["text"][:SNIPPET_CHARS],
                "length": doc_lengths.get(str(d["id"]), 0),
            }, ensure_ascii=False) + "\n")

    print(f"\nDocuments:       {n_docs}")
    print(f"Average length:  {avgdl:.1f} tokens")
    print(f"Unique terms:    {n_terms}")
    print(f"Total postings:  {n_postings}")
    print(f"Files written to {OUT_DIR}")
    spark.stop()


if __name__ == "__main__":
    main()