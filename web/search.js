(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SearchLib = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const K1 = 1.5, B = 0.75;
  const SUFFIXES = ["ing", "ed", "es", "s", "ly", "al"];

  function tokenize(text) {
    return text.toLowerCase().match(/[a-z0-9]+/g) || [];
  }
  const rankSort = (arr) => arr.sort((a, b) => b[1] - a[1] || a[0] - b[0]);

  // Damerau-Levenshtein (adjacent swaps count as one edit). Returns a value
  // greater than `max` as soon as the distance is known to exceed it.
  function editDistance(a, b, max) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev2 = null;
    let prev = Array.from({ length: lb + 1 }, (_, j) => j);
    for (let i = 1; i <= la; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur.push(v);
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[lb];
  }

  function Engine(index, docs, lang) {
    this.N = index.N;
    this.avgdl = index.avgdl;
    this.docLen = index.docLen;
    this.terms = new Map(Object.entries(index.terms));
    this.docs = docs;
    this.stems = new Map(Object.entries(lang.stems));
    this.stop = new Set(lang.stop);
    this.vocab = lang.vocab || [];            // [[word, df], ...] sorted by df desc
    this.norms = this._norms();
  }

  Engine.prototype._norms = function () {
    const sq = new Float64Array(this.N);
    for (const [df, flat] of this.terms.values()) {
      const idf = Math.log10(this.N / df);
      for (let i = 0; i < flat.length; i += 2) {
        const w = (1 + Math.log10(flat[i + 1])) * idf;
        sq[flat[i]] += w * w;
      }
    }
    return sq.map(Math.sqrt);
  };

  Engine.prototype.keep = function (w) {
    if (w.length < 2 || w.length > 30) return false;
    if (/^\d+$/.test(w) && w.length > 4) return false;
    return !this.stop.has(w);
  };

  Engine.prototype.resolve = function (w) {
    const direct = this.stems.get(w) || w;
    if (this.terms.has(direct)) return direct;
    for (const suf of SUFFIXES) {
      if (w.length - suf.length >= 3 && w.endsWith(suf)) {
        const base = w.slice(0, -suf.length);
        const cand = this.stems.get(base) || base;
        if (this.terms.has(cand)) return cand;
      }
    }
    return null;
  };

  Engine.prototype.analyze = function (query) {
    const qtf = new Map(), unknown = [];
    for (const w of tokenize(query)) {
      if (!this.keep(w)) continue;
      const t = this.resolve(w);
      if (t === null) unknown.push(w);
      else qtf.set(t, (qtf.get(t) || 0) + 1);
    }
    return { qtf, unknown };
  };

  Engine.prototype.bm25 = function (query) {
    const { qtf } = this.analyze(query);
    const scores = new Map();
    for (const term of qtf.keys()) {
      const [df, flat] = this.terms.get(term);
      const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
      for (let i = 0; i < flat.length; i += 2) {
        const id = flat[i], tf = flat[i + 1];
        const norm = tf + K1 * (1 - B + (B * this.docLen[id]) / this.avgdl);
        scores.set(id, (scores.get(id) || 0) + (idf * tf * (K1 + 1)) / norm);
      }
    }
    return rankSort(Array.from(scores));
  };

  Engine.prototype.tfidf = function (query) {
    const { qtf } = this.analyze(query);
    const scores = new Map();
    let qsq = 0;
    for (const [term, n] of qtf) {
      const [df, flat] = this.terms.get(term);
      const idf = Math.log10(this.N / df);
      const wq = (1 + Math.log10(n)) * idf;
      qsq += wq * wq;
      for (let i = 0; i < flat.length; i += 2) {
        const id = flat[i];
        scores.set(id, (scores.get(id) || 0) + wq * (1 + Math.log10(flat[i + 1])) * idf);
      }
    }
    const qnorm = Math.sqrt(qsq);
    if (qnorm === 0) return [];
    const out = [];
    for (const [id, s] of scores) {
      if (this.norms[id] > 0) out.push([id, s / (this.norms[id] * qnorm)]);
    }
    return rankSort(out);
  };

  Engine.prototype.boolean = function (query) {
    const self = this;
    const toks = query.match(/\(|\)|[A-Za-z0-9]+/g) || [];
    let pos = 0;
    const peek = () => (pos < toks.length ? toks[pos] : null);
    const union = (a, b) => (a === null ? b : b === null ? a : new Set([...a, ...b]));
    const inter = (a, b) =>
      a === null ? b : b === null ? a : new Set([...a].filter((x) => b.has(x)));

    function parseOr() {
      let left = parseAnd();
      while (peek() === "OR") { pos++; left = union(left, parseAnd()); }
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (peek() !== null && peek() !== "OR" && peek() !== ")") {
        if (peek() === "AND") pos++;
        left = inter(left, parseNot());
      }
      return left;
    }
    function parseNot() {
      if (peek() === "NOT") {
        pos++;
        const inner = parseNot();
        if (inner === null) return null;
        const all = new Set();
        for (let i = 0; i < self.N; i++) if (!inner.has(i)) all.add(i);
        return all;
      }
      return parseAtom();
    }
    function parseAtom() {
      const tok = peek();
      if (tok === null || tok === ")") return null;
      pos++;
      if (tok === "(") {
        const inner = parseOr();
        if (peek() === ")") pos++;
        return inner;
      }
      if (tok === "AND" || tok === "OR") return null;
      const w = tok.toLowerCase();
      if (!self.keep(w)) return null;
      const t = self.resolve(w);
      const set = new Set();
      if (t !== null) {
        const flat = self.terms.get(t)[1];
        for (let i = 0; i < flat.length; i += 2) set.add(flat[i]);
      }
      return set;
    }

    const result = parseOr();
    return result ? Array.from(result).sort((a, b) => a - b) : [];
  };

  /* ---------------- Task 9 extras ---------------- */

  // Autocomplete: most frequent vocabulary words that start with the prefix.
  Engine.prototype.suggest = function (prefix, n) {
    const p = prefix.toLowerCase();
    const out = [];
    if (p.length < 2) return out;
    for (const [w] of this.vocab) {
      if (w !== p && w.startsWith(p)) {
        out.push(w);
        if (out.length >= n) break;
      }
    }
    return out;
  };

  // Spelling: closest vocabulary word within 1 edit (short words) or 2 edits.
  // The vocabulary is sorted by frequency, so on equal distance the more
  // common word wins.
  Engine.prototype.correct = function (word) {
    if (word.length < 3 || !/^[a-z]+$/.test(word)) return null;
    const maxD = word.length <= 4 ? 1 : 2;
    let best = null, bestD = maxD + 1;
    for (const [w] of this.vocab) {
      if (w === word || Math.abs(w.length - word.length) > maxD) continue;
      const d = editDistance(word, w, maxD);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  };

  // Rewrites unknown words in a query; returns null when nothing changed.
  Engine.prototype.fixQuery = function (query, booleanMode) {
    const changes = [];
    const text = query.replace(/[A-Za-z0-9]+/g, (w) => {
      if (booleanMode && (w === "AND" || w === "OR" || w === "NOT")) return w;
      const lw = w.toLowerCase();
      if (!this.keep(lw) || this.resolve(lw) !== null) return w;
      const fix = this.correct(lw);
      if (!fix) return w;
      changes.push([w, fix]);
      return fix;
    });
    return changes.length ? { text, changes } : null;
  };

  // Runs all three models on one query for the side-by-side view.
  Engine.prototype.compare = function (query, k) {
    const bm25 = this.bm25(query), tfidf = this.tfidf(query);
    const bool = this.boolean(query);
    const rank = (arr) => new Map(arr.map(([id], i) => [id, i + 1]));
    const top1 = bm25.slice(0, k), top2 = tfidf.slice(0, k);
    const inTop2 = new Set(top2.map(([id]) => id));
    return {
      total: bm25.length,
      bm25: top1, tfidf: top2,
      boolean: bool, boolTop: bool.slice(0, k),
      rankBm25: rank(bm25), rankTfidf: rank(tfidf),
      shared: top1.filter(([id]) => inTop2.has(id)).length,
    };
  };

  return { Engine, tokenize, editDistance };
});