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

  function Engine(index, docs, lang) {
    this.N = index.N;
    this.avgdl = index.avgdl;
    this.docLen = index.docLen;
    this.terms = new Map(Object.entries(index.terms));   // Map: safe for any word
    this.docs = docs;
    this.stems = new Map(Object.entries(lang.stems));
    this.stop = new Set(lang.stop);
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

  // same filters as text_processing.preprocess (minus stemming)
  Engine.prototype.keep = function (w) {
    if (w.length < 2 || w.length > 30) return false;
    if (/^\d+$/.test(w) && w.length > 4) return false;
    return !this.stop.has(w);
  };

  // raw word -> index term, or null if the word is not in the index.
  // Words unseen in the corpus get a light suffix-stripping fallback.
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

  // AND, OR, NOT (uppercase), brackets, implicit AND. NOT > AND > OR.
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

  return { Engine, tokenize };
});