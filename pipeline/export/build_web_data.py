"""Task 8 (data step): export the index as compact JSON files for the browser.
Writes web/data/index.json, docs.json and lang.json."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "preprocess"))
from text_processing import STOPWORDS, preprocess, tokenize

IDX = ROOT / "data" / "index"
DOCS = ROOT / "data" / "clean" / "docs.jsonl"
OUT = ROOT / "web" / "data"
SNIPPET_CHARS = 600


def dump(obj, name):
    path = OUT / name
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    print(f"  {name:12s} {path.stat().st_size / 1024:8.0f} KB")


def make_snippet(text):
    if len(text) <= SNIPPET_CHARS:
        return text
    return text[:SNIPPET_CHARS].rsplit(" ", 1)[0] + " …"


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    stats = json.loads((IDX / "stats.json").read_text(encoding="utf-8"))
    n_docs = stats["N"]
    doc_len = [stats["doc_lengths"][str(i)] for i in range(n_docs)]

    # postings: term -> [df, [doc, tf, doc, tf, ...]]
    terms = {}
    with (IDX / "postings.jsonl").open(encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            terms[r["term"]] = [r["df"], [x for p in r["postings"] for x in p]]

    # documents for display + every distinct raw word (for the stem map)
    docs, tokens = [], set()
    with DOCS.open(encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            docs.append({"id": d["id"], "t": d["title"], "c": d["category"],
                         "u": d["url"], "s": make_snippet(d["text"])})
            tokens.update(tokenize(d["title"] + " " + d["text"]))
    assert [d["id"] for d in docs] == list(range(n_docs)), "ids must be 0..N-1"

    # raw word -> stem (only where they differ). The browser uses this
    # instead of re-implementing the Porter stemmer, so stems match exactly.
    stems = {}
    for tok in tokens:
        out = preprocess(tok)
        if out and out[0] != tok:
            stems[tok] = out[0]
    stems = dict(sorted(stems.items()))

    print("Writing", OUT)
    dump({"N": n_docs, "avgdl": stats["avgdl"], "docLen": doc_len,
          "terms": terms}, "index.json")
    dump(docs, "docs.json")
    dump({"stems": stems, "stop": sorted(STOPWORDS)}, "lang.json")
    print(f"\n{n_docs} documents, {len(terms)} terms, {len(stems)} stem entries")


if __name__ == "__main__":
    main()