"""Task 2: fetch Wikipedia article intros and build data/clean/docs.jsonl.
Rate-limit safe: retries on 429/5xx and caches each topic in data/raw/."""
import json
import re
import time
from pathlib import Path

import requests

API = "https://en.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": "doc-search-engine/1.0 (student IR project; contact: your-email@example.com)"}
OUT = Path("data/clean/docs.jsonl")
CACHE = Path("data/raw")

TOPICS = {
    "machine learning": "machine learning",
    "databases": "relational database SQL query",
    "distributed computing": "distributed computing",
    "information retrieval": "information retrieval search engine",
    "computer networks": "computer network protocol",
    "astronomy": "astronomy planet star",
    "biology": "biology cell genetics",
    "indian history": "history of India",
    "physics": "physics quantum mechanics",
    "economics": "economics market finance",
    "sports": "cricket football sport",
    "medicine": "medicine disease treatment",
}
PER_TOPIC = 250
MIN_WORDS = 40
DELAY = 1.0          # seconds between requests
MAX_RETRIES = 6


def get_json(params: dict) -> dict:
    """GET with retry + exponential backoff; honours Retry-After on 429."""
    for attempt in range(MAX_RETRIES):
        r = requests.get(API, params=params, headers=HEADERS, timeout=30)
        if r.status_code == 200:
            return r.json()
        if r.status_code in (429, 500, 502, 503, 504):
            wait = int(r.headers.get("Retry-After", 0)) or (5 * 2 ** attempt)
            print(f"  HTTP {r.status_code}, waiting {wait}s (retry {attempt + 1}/{MAX_RETRIES})")
            time.sleep(wait)
            continue
        r.raise_for_status()
    raise RuntimeError("Too many retries; try again in a few minutes")


def fetch_topic(query: str, limit: int):
    """Yield (pageid, title, extract) for a search query, paginating."""
    params = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": query, "gsrlimit": 20, "gsrnamespace": 0,
        "prop": "extracts", "exintro": 1, "explaintext": 1, "exlimit": "max",
    }
    got, cont = 0, {}
    while got < limit:
        data = get_json({**params, **cont})
        for p in data.get("query", {}).get("pages", {}).values():
            if p.get("extract"):
                yield p["pageid"], p["title"], p["extract"]
                got += 1
        if "continue" not in data:
            break
        cont = data["continue"]
        time.sleep(DELAY)


def clean(text: str) -> str:
    text = re.sub(r"\[\d+\]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def load_topic(label: str, query: str) -> list:
    """Return raw pages for a topic, using the cache if present."""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (label.replace(" ", "_") + ".json")
    if f.exists():
        print(f"{label:24s} (cached)")
        return json.loads(f.read_text(encoding="utf-8"))
    pages = [list(t) for t in fetch_topic(query, PER_TOPIC)]
    f.write_text(json.dumps(pages), encoding="utf-8")
    time.sleep(DELAY)
    return pages


def main() -> None:
    seen, docs = set(), []
    for label, query in TOPICS.items():
        count = 0
        for pageid, title, extract in load_topic(label, query):
            text = clean(extract)
            if pageid in seen or len(text.split()) < MIN_WORDS:
                continue
            if "may refer to" in text[:200]:
                continue
            seen.add(pageid)
            docs.append({
                "id": len(docs), "title": title, "text": text,
                "category": label,
                "url": "https://en.wikipedia.org/?curid=" + str(pageid),
            })
            count += 1
        print(f"{label:24s} {count} docs")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        for d in docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    print(f"\nSaved {len(docs)} documents to {OUT}")


if __name__ == "__main__":
    main()