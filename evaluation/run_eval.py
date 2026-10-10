"""Task 6: evaluate Boolean, TF-IDF and BM25 on the test queries.
Usage: python evaluation/run_eval.py [--per-query]"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "preprocess"))
sys.path.insert(0, str(ROOT / "pipeline" / "ranking"))

import metrics as M
from queries import QUERIES
from search import SearchEngine

OUT = ROOT / "docs" / "evaluation_results.md"


def mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-query", action="store_true")
    args = ap.parse_args()

    engine = SearchEngine.from_files()
    scores = {m: {"p5": [], "p10": [], "r100": [], "ap": [], "rr": []}
              for m in ("TF-IDF", "BM25")}
    boolean = {"p": [], "r": [], "size": [], "zero": 0}
    rows = []

    for q in QUERIES:
        relevant = {d for d, m in engine.meta.items()
                    if m["category"] in q["relevant"]}
        runs = {
            "TF-IDF": [d for d, _ in engine.tfidf(q["q"], top=100)],
            "BM25": [d for d, _ in engine.bm25(q["q"], top=100)],
        }
        ap_row = {}
        for name, ranked in runs.items():
            s = scores[name]
            s["p5"].append(M.precision_at_k(ranked, relevant, 5))
            s["p10"].append(M.precision_at_k(ranked, relevant, 10))
            s["r100"].append(M.recall_at_k(ranked, relevant, 100))
            s["ap"].append(M.average_precision(ranked, relevant, 100))
            s["rr"].append(M.reciprocal_rank(ranked, relevant))
            ap_row[name] = s["ap"][-1]

        ids = engine.boolean(q["bool"])
        p, r = M.set_precision_recall(ids, relevant)
        boolean["p"].append(p)
        boolean["r"].append(r)
        boolean["size"].append(len(ids))
        boolean["zero"] += (len(ids) == 0)
        rows.append((q["q"], ap_row["TF-IDF"], ap_row["BM25"], p, r, len(ids)))

    if args.per_query:
        print(f"{'query':46s} {'AP tfidf':>8s} {'AP bm25':>8s} "
              f"{'B prec':>7s} {'B rec':>6s} {'B size':>6s}")
        for qtext, a1, a2, p, r, n in rows:
            print(f"{qtext[:45]:46s} {a1:8.3f} {a2:8.3f} {p:7.3f} {r:6.3f} {n:6d}")
        print()

    lines = [
        f"# Evaluation results ({len(QUERIES)} queries, {len(engine.meta)} documents)",
        "",
        "Relevance = the document's category matches the query's category.",
        "",
        "## Ranked models",
        "",
        "| Model | P@5 | P@10 | Recall@100 | MAP@100 | MRR |",
        "|---|---|---|---|---|---|",
    ]
    for name, s in scores.items():
        lines.append(f"| {name} | {mean(s['p5']):.3f} | {mean(s['p10']):.3f} | "
                     f"{mean(s['r100']):.3f} | {mean(s['ap']):.3f} | {mean(s['rr']):.3f} |")
    lines += [
        "",
        "## Boolean model (unranked, whole result set)",
        "",
        "| Model | Set precision | Set recall | Avg results | Queries with 0 results |",
        "|---|---|---|---|---|",
        f"| Boolean | {mean(boolean['p']):.3f} | {mean(boolean['r']):.3f} | "
        f"{mean(boolean['size']):.1f} | {boolean['zero']} / {len(QUERIES)} |",
    ]
    text = "\n".join(lines) + "\n"
    print(text)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"Saved to {OUT}")


if __name__ == "__main__":
    main()