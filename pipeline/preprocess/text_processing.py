"""Task 3: shared text preprocessing for documents AND queries."""
import re
from functools import lru_cache

from nltk.stem import PorterStemmer

STOPWORDS = frozenset("""
a about above after again against all am an and any are aren as at be because
been before being below between both but by can cannot could couldn did didn
do does doesn doing don down during each few for from further had hadn has
hasn have haven having he her here hers herself him himself his how i if in
into is isn it its itself just let me more most mustn my myself no nor not of
off on once only or other ought our ours ourselves out over own same shan she
should shouldn so some such than that the their theirs them themselves then
there these they this those through to too under until up very was wasn we
were weren what when where which while who whom why will with won would
wouldn you your yours yourself yourselves also however may might one two
often many much among within without upon via per etc ie eg s t d ll m o re ve y
""".split())

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_stemmer = PorterStemmer()


@lru_cache(maxsize=200_000)
def stem(word: str) -> str:
    return _stemmer.stem(word)


def tokenize(text: str) -> list:
    """Lowercase and split into alphanumeric tokens."""
    return _TOKEN_RE.findall(text.lower())


def preprocess(text) -> list:
    """Full pipeline: tokenize -> drop noise/stopwords -> stem."""
    if not text:
        return []
    out = []
    for tok in tokenize(text):
        if len(tok) < 2 or len(tok) > 30:
            continue
        if tok.isdigit() and len(tok) > 4:      # long numbers are noise
            continue
        if tok in STOPWORDS:
            continue
        out.append(stem(tok))
    return out