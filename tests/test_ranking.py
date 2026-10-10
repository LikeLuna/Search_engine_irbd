from collections import Counter, defaultdict
from pathlib import Path

import pytest

from search import SearchEngine, IDX
from text_processing import preprocess

TEXTS = ["apple apple banana",          # doc 0
         "apple cherry",                # doc 1
         "banana cherry cherry date"]   # doc 2


def build_engine(texts=TEXTS):
    postings, lengths = defaultdict(list), {}
    for i, text in enumerate(texts):
        tokens = preprocess(text)
        lengths[str(i)] = len(tokens)
        for term, tf in Counter(tokens).items():
            postings[term].append([i, tf])
    post = {t: (len(pl), pl) for t, pl in postings.items()}
    stats = {"N": len(texts),
             "avgdl": sum(lengths.values()) / len(texts),
             "doc_lengths": lengths}
    meta = {i: {"id": i, "title": f"doc{i}", "category": "x", "url": ""}
            for i in range(len(texts))}
    return SearchEngine(post, stats, meta)


def test_boolean_operators():
    e = build_engine()
    assert e.boolean("apple AND banana") == [0]
    assert e.boolean("apple OR banana") == [0, 1, 2]
    assert e.boolean("cherry AND NOT apple") == [2]
    assert e.boolean("NOT apple") == [2]
    assert e.boolean("apple banana") == [0]                  # implicit AND
    assert e.boolean("(apple OR date) AND NOT banana") == [1]


def test_bm25_prefers_higher_tf():
    e = build_engine()
    assert [d for d, _ in e.bm25("apple")] == [0, 1]         # doc 2 has no apple


def test_bm25_rare_term_weighs_more():
    e = build_engine()
    assert e.bm25("apple date")[0][0] == 2                   # 'date' is rarer


def test_tfidf_cosine_ranking():
    e = build_engine()
    ranked = e.tfidf("cherry")
    assert [d for d, _ in ranked] == [1, 2]
    assert all(0 < s <= 1.0001 for _, s in ranked)


def test_unknown_terms_return_nothing():
    e = build_engine()
    assert e.bm25("zzzz") == [] and e.tfidf("zzzz") == []
    assert e.boolean("zzzz") == []


real = pytest.mark.skipif(not (IDX / "postings.jsonl").exists(),
                          reason="run build_index.py first")


@real
def test_real_index_quantum_query_finds_physics():
    e = SearchEngine.from_files()
    top = e.bm25("quantum mechanics", top=10)
    cats = [e.meta[d]["category"] for d, _ in top]
    assert cats.count("physics") >= 5


@real
def test_real_index_all_models_return_results():
    e = SearchEngine.from_files()
    q = "distributed file system"
    assert len(e.bm25(q, top=10)) == 10
    assert len(e.tfidf(q, top=10)) == 10
    assert len(e.boolean(q)) > 0