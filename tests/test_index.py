import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDX = ROOT / "data" / "index"


def load_tokens():
    docs = {}
    with (ROOT / "data" / "clean" / "tokens.jsonl").open(encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            docs[d["id"]] = d["tokens"]
    return docs


def load_postings():
    with (IDX / "postings.jsonl").open(encoding="utf-8") as f:
        return {r["term"]: r for r in map(json.loads, f)}


def test_stats_match_tokens():
    docs = load_tokens()
    stats = json.loads((IDX / "stats.json").read_text(encoding="utf-8"))
    assert stats["N"] == len(docs)
    total = sum(len(t) for t in docs.values())
    assert abs(stats["avgdl"] - total / len(docs)) < 1e-6
    for doc_id, tokens in list(docs.items())[:50]:
        assert stats["doc_lengths"][str(doc_id)] == len(tokens)


def test_postings_match_brute_force():
    docs = load_tokens()
    expected = defaultdict(dict)
    for doc_id, tokens in docs.items():
        for term, tf in Counter(tokens).items():
            expected[term][doc_id] = tf

    index = load_postings()
    assert set(index) == set(expected)
    for term in list(expected)[:300]:            # sample of 300 terms
        row = index[term]
        assert row["df"] == len(expected[term])
        assert {d: tf for d, tf in row["postings"]} == expected[term]


def test_postings_sorted_by_doc_id():
    for row in list(load_postings().values())[:500]:
        ids = [p[0] for p in row["postings"]]
        assert ids == sorted(ids)