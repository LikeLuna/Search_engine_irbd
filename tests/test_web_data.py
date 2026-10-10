import json
import shutil
import subprocess
from pathlib import Path

import pytest

from search import SearchEngine
from text_processing import preprocess

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web" / "data"
IDX = ROOT / "data" / "index"

needs_export = pytest.mark.skipif(
    not (WEB / "index.json").exists(),
    reason="run pipeline/export/build_web_data.py first")


def read(name):
    return json.loads((WEB / name).read_text(encoding="utf-8"))


@needs_export
def test_exported_index_matches_postings():
    index = read("index.json")
    seen = 0
    with (IDX / "postings.jsonl").open(encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            df, flat = index["terms"][r["term"]]
            assert df == r["df"]
            assert flat == [x for p in r["postings"] for x in p]
            seen += 1
    assert seen == len(index["terms"])
    assert index["N"] == len(index["docLen"])


@needs_export
def test_stem_map_agrees_with_python_preprocessing():
    lang = read("lang.json")
    for word, stem in lang["stems"].items():
        assert preprocess(word) == [stem]
    assert "the" in lang["stop"] and preprocess("the") == []


@needs_export
def test_docs_file_is_complete():
    docs = read("docs.json")
    assert [d["id"] for d in docs] == list(range(len(docs)))
    assert all({"t", "c", "u", "s"} <= set(d) for d in docs)


RANKED = ["distributed file system", "quantum mechanics", "database transaction isolation",
          "cricket world cup", "vaccine infection patients", "internet routing protocol",
          "Mughal empire British colonial rule", "neural network training",
          "relativity gravity force", "stock market", "asdfgh quantum"]
BOOLEAN = ["quantum AND (particle OR wave)", "database AND transaction AND NOT distributed",
           "cricket OR football", "NOT cricket", "neural AND (training OR learning)",
           "the AND quantum", "zzzz", "protocol AND NOT (network OR wireless)"]


@needs_export
@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_javascript_engine_matches_python(tmp_path):
    engine = SearchEngine.from_files()
    expected = {
        "ranked": [{"q": q,
                    "bm25": [list(p) for p in engine.bm25(q, top=20)],
                    "tfidf": [list(p) for p in engine.tfidf(q, top=20)]} for q in RANKED],
        "boolean": [{"q": q, "ids": engine.boolean(q)} for q in BOOLEAN],
    }
    path = tmp_path / "expected.json"
    path.write_text(json.dumps(expected), encoding="utf-8")
    run = subprocess.run(["node", str(ROOT / "tests" / "js_parity.js"), str(path)],
                         capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr