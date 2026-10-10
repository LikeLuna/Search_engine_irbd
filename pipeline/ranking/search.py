"""Task 5: Boolean, TF-IDF (cosine) and BM25 retrieval over the inverted index."""
import argparse
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "preprocess"))
from text_processing import preprocess

IDX = ROOT / "data" / "index"
K1, B = 1.5, 0.75          # BM25 parameters


class SearchEngine:
    def __init__(self, postings, stats, meta):
        self.postings = postings        # term -> (df, [[doc_id, tf], ...])
        self.N = stats["N"]
        self.avgdl = stats["avgdl"]
        self.doc_len = {int(k): v for k, v in stats["doc_lengths"].items()}
        self.meta = meta                # doc_id -> metadata dict
        self.all_ids = set(self.doc_len)
        self._norms = self._compute_norms()

    @classmethod
    def from_files(cls, idx=IDX):
        postings = {}
        with (idx / "postings.jsonl").open(encoding="utf-8") as f:
            for line in f:
                r = json.loads(line)
                postings[r["term"]] = (r["df"], r["postings"])
        stats = json.loads((idx / "stats.json").read_text(encoding="utf-8"))
        meta = {}
        with (idx / "docs_meta.jsonl").open(encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                meta[d["id"]] = d
        return cls(postings, stats, meta)

    # ---------------------------------------------------------- helpers
    def _compute_norms(self):
        """Length of every document's TF-IDF vector (for cosine)."""
        sq = defaultdict(float)
        for df, plist in self.postings.values():
            idf = math.log10(self.N / df)
            for doc_id, tf in plist:
                w = (1 + math.log10(tf)) * idf
                sq[doc_id] += w * w
        return {d: math.sqrt(v) for d, v in sq.items()}

    def _query_terms(self, query):
        """Preprocess like documents; keep only terms that exist in the index."""
        return Counter(t for t in preprocess(query) if t in self.postings)

    @staticmethod
    def _top(pairs, top):
        ranked = sorted(pairs, key=lambda p: (-p[1], p[0]))
        return ranked[:top] if top else ranked

    # ---------------------------------------------------------- TF-IDF
    def tfidf(self, query, top=10):
        q = self._query_terms(query)
        scores = defaultdict(float)
        qnorm_sq = 0.0
        for term, qtf in q.items():
            df, plist = self.postings[term]
            idf = math.log10(self.N / df)
            wq = (1 + math.log10(qtf)) * idf
            qnorm_sq += wq * wq
            for doc_id, tf in plist:
                scores[doc_id] += wq * (1 + math.log10(tf)) * idf
        qnorm = math.sqrt(qnorm_sq)
        if qnorm == 0:
            return []
        ranked = [(d, s / (self._norms[d] * qnorm))
                  for d, s in scores.items() if self._norms.get(d, 0) > 0]
        return self._top(ranked, top)

    # ---------------------------------------------------------- BM25
    def bm25(self, query, top=10):
        scores = defaultdict(float)
        for term in self._query_terms(query):
            df, plist = self.postings[term]
            idf = math.log(1 + (self.N - df + 0.5) / (df + 0.5))
            for doc_id, tf in plist:
                dl = self.doc_len[doc_id]
                norm = tf + K1 * (1 - B + B * dl / self.avgdl)
                scores[doc_id] += idf * tf * (K1 + 1) / norm
        return self._top(scores.items(), top)

    # ---------------------------------------------------------- Boolean
    def boolean(self, query):
        """Supports AND, OR, NOT (uppercase), brackets, implicit AND.
        Precedence: NOT > AND > OR. Returns a sorted list of doc ids."""
        tokens = re.findall(r"\(|\)|[A-Za-z0-9]+", query)
        pos = 0

        def peek():
            return tokens[pos] if pos < len(tokens) else None

        def union(a, b):
            if a is None:
                return b
            return a if b is None else a | b

        def inter(a, b):
            if a is None:
                return b
            return a if b is None else a & b

        def parse_or():
            nonlocal pos
            left = parse_and()
            while peek() == "OR":
                pos += 1
                left = union(left, parse_and())
            return left

        def parse_and():
            nonlocal pos
            left = parse_not()
            while peek() not in (None, "OR", ")"):
                if peek() == "AND":
                    pos += 1
                left = inter(left, parse_not())
            return left

        def parse_not():
            nonlocal pos
            if peek() == "NOT":
                pos += 1
                inner = parse_not()
                return None if inner is None else self.all_ids - inner
            return parse_atom()

        def parse_atom():
            nonlocal pos
            tok = peek()
            if tok is None or tok == ")":
                return None
            pos += 1
            if tok == "(":
                inner = parse_or()
                if peek() == ")":
                    pos += 1
                return inner
            if tok in ("AND", "OR"):         # stray operator, ignore
                return None
            terms = preprocess(tok)          # stopwords vanish -> None
            if not terms:
                return None
            return {d for d, _ in self.postings.get(terms[0], (0, []))[1]}

        result = parse_or()
        return sorted(result) if result else []


# ------------------------------------------------------------------ CLI
def _print_ranked(engine, title, results):
    print(f"\n=== {title} ===")
    if not results:
        print("  no results")
    for rank, (doc_id, score) in enumerate(results, 1):
        m = engine.meta[doc_id]
        print(f"  {rank:>2}. {score:7.3f}  {m['title']}  [{m['category']}]")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Search the document index")
    ap.add_argument("query", nargs="+")
    ap.add_argument("--model", default="all",
                    choices=["boolean", "tfidf", "bm25", "all"])
    ap.add_argument("--top", type=int, default=5)
    args = ap.parse_args()
    query = " ".join(args.query)

    engine = SearchEngine.from_files()
    print(f"Query: {query}")

    if args.model in ("tfidf", "all"):
        _print_ranked(engine, "TF-IDF (cosine)", engine.tfidf(query, args.top))
    if args.model in ("bm25", "all"):
        _print_ranked(engine, "BM25", engine.bm25(query, args.top))
    if args.model in ("boolean", "all"):
        ids = engine.boolean(query)
        print(f"\n=== Boolean (unranked, {len(ids)} matches) ===")
        for doc_id in ids[:args.top]:
            m = engine.meta[doc_id]
            print(f"      {m['title']}  [{m['category']}]")


if __name__ == "__main__":
    main()