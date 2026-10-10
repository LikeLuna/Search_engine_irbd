(function () {
  "use strict";
  const PAGE = 10;
  const HINTS = {
    bm25: "BM25: rewards rare query words, limits repeated words, adjusts for document length.",
    tfidf: "TF-IDF: documents and query as weighted vectors, ranked by cosine similarity.",
    boolean: "Boolean: exact matching with AND, OR, NOT and brackets (operators in capitals). Results are unranked.",
  };
  const EXAMPLES = {
    ranked: ["distributed file system", "quantum mechanics", "database transaction",
             "Mughal empire", "vaccine infection"],
    boolean: ["quantum AND (particle OR wave)", "database AND transaction AND NOT distributed",
              "cricket OR football"],
  };
  const $ = (id) => document.getElementById(id);
  const els = {
    form: $("search-form"), q: $("q"), hint: $("hint"), examples: $("examples"),
    status: $("status"), filters: $("filters"), results: $("results"),
    more: $("more"), tagline: $("tagline"),
  };
  const state = { q: "", model: "bm25", cat: "", shown: PAGE, results: [], unknown: [], ms: 0 };
  let engine = null;

  const esc = (s) => s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const currentModel = () => document.querySelector('input[name="model"]:checked').value;

  /* ---------- snippet with the best window and highlighted terms ---------- */
  function snippetHtml(text, hl) {
    const re = /[A-Za-z0-9]+/g;
    const hits = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const w = m[0].toLowerCase();
      if (hl.has(engine.stems.get(w) || w)) hits.push([m.index, m.index + m[0].length]);
    }
    const WIN = 240;
    let start = 0;
    if (hits.length) {
      let best = -1;
      for (const [s] of hits) {
        const from = Math.max(0, s - 50);
        const cnt = hits.filter(([a]) => a >= from && a < from + WIN).length;
        if (cnt > best) { best = cnt; start = from; }
      }
    }
    if (start > 0) {
      const sp = text.indexOf(" ", start);
      if (sp !== -1) start = sp + 1;
    }
    let end = Math.min(text.length, start + WIN);
    if (end < text.length) {
      const sp = text.lastIndexOf(" ", end);
      if (sp > start) end = sp;
    }
    let out = "", cur = start;
    for (const [a, b] of hits) {
      if (b <= start || a >= end || a < cur) continue;
      out += esc(text.slice(cur, a)) + "<mark>" + esc(text.slice(a, Math.min(b, end))) + "</mark>";
      cur = Math.min(b, end);
    }
    out += esc(text.slice(cur, end));
    return (start > 0 ? "… " : "") + out + (end < text.length ? " …" : "");
  }

  /* ---------- search ---------- */
  function queryForAnalysis(q) {
    return state.model === "boolean" ? q.replace(/\b(AND|OR|NOT)\b/g, " ") : q;
  }

  function runSearch() {
    const q = state.q.trim();
    state.shown = PAGE;
    if (!q) { state.results = []; state.unknown = []; render(); return; }
    const t0 = performance.now();
    if (state.model === "boolean") state.results = engine.boolean(q).map((id) => [id, null]);
    else state.results = state.model === "bm25" ? engine.bm25(q) : engine.tfidf(q);
    state.ms = performance.now() - t0;
    state.unknown = engine.analyze(queryForAnalysis(q)).unknown;
    syncUrl();
    render();
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q.trim()) p.set("q", state.q.trim());
    if (state.model !== "bm25") p.set("model", state.model);
    if (state.cat) p.set("cat", state.cat);
    history.replaceState(null, "", p.toString() ? "?" + p : location.pathname);
  }

  /* ---------- rendering ---------- */
  function renderExamples() {
    const list = state.model === "boolean" ? EXAMPLES.boolean : EXAMPLES.ranked;
    els.examples.innerHTML = "";
    if (state.q.trim()) return;
    for (const ex of list) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = ex;
      b.addEventListener("click", () => { els.q.value = ex; state.q = ex; state.cat = ""; runSearch(); });
      els.examples.appendChild(b);
    }
  }

  function render() {
    els.hint.textContent = HINTS[state.model];
    renderExamples();
    const q = state.q.trim();
    if (!q) {
      els.status.textContent = ""; els.filters.innerHTML = "";
      els.results.innerHTML = ""; els.more.hidden = true; return;
    }

    // category counts over all matches
    const counts = new Map();
    for (const [id] of state.results) {
      const c = engine.docs[id].c;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    if (state.cat && !counts.has(state.cat)) state.cat = "";
    const filtered = state.cat
      ? state.results.filter(([id]) => engine.docs[id].c === state.cat) : state.results;

    // status line
    let msg = filtered.length + (filtered.length === 1 ? " result" : " results");
    if (state.cat) msg += " in " + state.cat;
    msg += " · " + state.ms.toFixed(1) + " ms · " + (state.model === "boolean" ? "unranked" : "ranked");
    if (state.unknown.length) msg += " · not in index: " + state.unknown.join(", ");
    els.status.textContent = state.results.length ? msg
      : "No results" + (state.unknown.length ? " (not in index: " + state.unknown.join(", ") + ")" : "") +
        ". Try different words" + (state.model === "boolean" ? " or OR instead of AND." : ".");

    // filter chips
    els.filters.innerHTML = "";
    if (counts.size > 1) {
      const mk = (label, value, n) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip" + (state.cat === value ? " active" : "");
        b.innerHTML = esc(label) + "<small>" + n + "</small>";
        b.addEventListener("click", () => { state.cat = value; state.shown = PAGE; syncUrl(); render(); });
        els.filters.appendChild(b);
      };
      mk("All", "", state.results.length);
      Array.from(counts).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => mk(c, c, n));
    }

    // results
    const hl = new Set(engine.analyze(queryForAnalysis(q)).qtf.keys());
    els.results.innerHTML = "";
    filtered.slice(0, state.shown).forEach(([id, score], i) => {
      const d = engine.docs[id];
      const li = document.createElement("li");
      li.innerHTML =
        '<article class="card"><div class="rank">' + (i + 1) + '</div><div>' +
        '<h2><a href="' + esc(d.u) + '" target="_blank" rel="noopener">' + esc(d.t) + "</a></h2>" +
        '<div class="meta"><span class="badge">' + esc(d.c) + "</span>" +
        (score === null ? "" : "<span>score " + score.toFixed(3) + "</span>") + "</div>" +
        "<p>" + snippetHtml(d.s, hl) + "</p></div></article>";
      els.results.appendChild(li);
    });
    els.more.hidden = filtered.length <= state.shown;
  }

  /* ---------- events ---------- */
  els.form.addEventListener("submit", (e) => {
    e.preventDefault(); state.q = els.q.value; state.cat = ""; runSearch();
  });
  document.querySelectorAll('input[name="model"]').forEach((r) =>
    r.addEventListener("change", () => { state.model = currentModel(); state.cat = ""; runSearch(); }));
  els.more.addEventListener("click", () => { state.shown += PAGE; render(); });

  /* ---------- start ---------- */
  async function init() {
    els.hint.textContent = HINTS.bm25;
    try {
      const files = ["data/index.json", "data/docs.json", "data/lang.json"];
      const [index, docs, lang] = await Promise.all(files.map((u) =>
        fetch(u).then((r) => { if (!r.ok) throw new Error(u + " (" + r.status + ")"); return r.json(); })));
      engine = new SearchLib.Engine(index, docs, lang);
    } catch (err) {
      els.tagline.className = "error";
      els.tagline.textContent = "Could not load the index (" + err.message +
        "). Run the export script and open the page through a web server, not as a file.";
      return;
    }
    els.tagline.textContent = engine.N.toLocaleString() + " documents · " +
      engine.terms.size.toLocaleString() + " indexed terms";
    const p = new URLSearchParams(location.search);
    if (["bm25", "tfidf", "boolean"].includes(p.get("model"))) {
      state.model = p.get("model");
      document.querySelector('input[value="' + state.model + '"]').checked = true;
    }
    state.q = p.get("q") || ""; state.cat = p.get("cat") || "";
    els.q.value = state.q;
    runSearch();
  }
  init();
})();