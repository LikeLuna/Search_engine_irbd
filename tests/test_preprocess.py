from text_processing import preprocess, tokenize


def test_lowercase_and_split():
    assert tokenize("Hello, World! 2024") == ["hello", "world", "2024"]


def test_stopwords_removed():
    assert preprocess("The cats are running") == ["cat", "run"]


def test_stemming_matches_variants():
    # query "searching" must match document "searched"
    assert preprocess("searching") == preprocess("searched") == ["search"]


def test_indexing_stem():
    assert preprocess("indexing") == ["index"]


def test_empty_and_none():
    assert preprocess("") == []
    assert preprocess(None) == []


def test_long_numbers_dropped_but_years_kept():
    assert preprocess("founded 1947 id 123456789") == ["found", "1947", "id"]