"""Look up a word in the index: python pipeline/index/lookup.py network"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "preprocess"))
from text_processing import preprocess

IDX = ROOT / "data" / "index"


def main() -> None:
    word = " ".join(sys.argv[1:]) or "network"
    terms = preprocess(word)
    if not terms:
        print("Query is empty after preprocessing (stopword?)")
        return
    term = terms[0]

    meta = {}
    with (IDX / "docs_meta.jsonl").open(encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            meta[d["id"]] = d

    with (IDX / "postings.jsonl").open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            if row["term"] == term:
                top = sorted(row["postings"], key=lambda p: -p[1])[:5]
                print(f"'{word}' -> stem '{term}', in {row['df']} documents")
                for doc_id, tf in top:
                    print(f"  tf={tf:<3} {meta[doc_id]['title']}"
                          f"  [{meta[doc_id]['category']}]")
                return
    print(f"Term '{term}' not found in index")


if __name__ == "__main__":
    main()