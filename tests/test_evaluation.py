import pytest

import metrics as M
from queries import QUERIES
from search import SearchEngine, IDX


def test_precision_and_recall():
    ranked, relevant = [1, 2, 3, 4], {1, 3}
    assert M.precision_at_k(ranked, relevant, 2) == 0.5
    assert M.recall_at_k(ranked, relevant, 4) == 1.0
    assert M.recall_at_k(ranked, relevant, 1) == 0.5


def test_average_precision():
    # hits at rank 1 and 3: (1/1 + 2/3) / 2
    assert M.average_precision([1, 2, 3, 4], {1, 3}) == pytest.approx(5 / 6)
    assert M.average_precision([9, 8], {1, 3}) == 0.0


def test_reciprocal_rank():
    assert M.reciprocal_rank([5, 6, 1], {1}) == pytest.approx(1 / 3)
    assert M.reciprocal_rank([5, 6], {1}) == 0.0


def test_set_metrics():
    p, r = M.set_precision_recall({1, 2, 3}, {2, 3, 4})
    assert p == pytest.approx(2 / 3) and r == pytest.approx(2 / 3)
    assert M.set_precision_recall(set(), {1}) == (0.0, 0.0)


real = pytest.mark.skipif(not (IDX / "postings.jsonl").exists(),
                          reason="run build_index.py first")


@real
def test_queries_use_real_categories():
    engine = SearchEngine.from_files()
    cats = {m["category"] for m in engine.meta.values()}
    for q in QUERIES:
        assert set(q["relevant"]) <= cats, q


def test_query_set_shape():
    assert len(QUERIES) == 24
    assert all({"q", "bool", "relevant"} <= set(q) for q in QUERIES)