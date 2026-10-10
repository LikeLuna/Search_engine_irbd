(function () {
  "use strict";
  const PAGE = 10;
  const MODELS = ["bm25", "tfidf", "boolean", "compare"];
  const HINTS = {
    bm25: "BM25: rewards rare query words, limits repeated words, adjusts for document length.",
    tfidf: "TF-IDF: documents and query as weighted vectors, ranked by cosine similarity.",
    boolean: "Boolean: exact matching with AND, OR, NOT and brackets (operators in capitals). Results are unranked.",
    compare: "Compare: the same query run through all three models, side by side.",
  };
  const EXAMPLES = {
    ranked: ["distributed file system", "quantum mechanics", "database transaction",
             "Mughal empire", "vaccine infection"],
    boolean: ["quantum AND (particle OR wave)", "database AND transaction AND NOT distributed",
              "cricket OR football"],
  };
  const $ = (id) => document.getElementById(id);

  // create containers that an older index.html may be missing
  function ensure(id, cls, before) {
    let el = $(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      if (cls) el.className = cls;
      before.parentNode.insertBefore(el, before);
    }
    return el;
  }

  const els = {
    main: document.querySelector("main"), form: $("search-form"), q: $("q"),
    suggest: $("suggest"), hint: $("hint"), examples: $("examples"),
    status: $("status"), filters: $("filters"), results: $("results"),
    more: $("more"), tagline: $("tagline"),
  };
  els.dym = ensure("dym", "dym", els.status);
  els.compare = ensure("compare", "", els.more);
  els.dym.hidden = true;
  els.compare.hidden = true;

  const state = { q: "", model: "bm25", cat: "", shown: PAGE, results: [],
                  unknown: [], fix: null, auto: null, used: "", cmp: null, ms: 0 };
  let engine = null, sugItems = [], sugIndex = -1;

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

  // runs the current model on q, stores the results, returns how many matched
  function execute(q) {
    if (state.model === "boolean") {
      state.cmp = null;
      state.results = engine.boolean(q).map((id) => [id, null]);
      return state.results.length;
    }
    if (state.model === "compare") {
      state.cmp = engine.compare(q, 5);
      state.results = [];
      return state.cmp.total;
    }
    state.cmp = null;
    state.results = state.model === "bm25" ? engine.bm25(q) : engine.tfidf(q);
    return state.results.length;
  }

  function runSearch(noAutoFix) {
    const q = state.q.trim();
    state.shown = PAGE; state.cmp = null; state.fix = null; state.auto = null; state.used = q;
    if (!q) { state.results = []; state.unknown = []; syncUrl(); render(); return; }

    const t0 = performance.now();
    const isBool = state.model === "boolean";
    const count = execute(q);
    let unknown = engine.analyze(queryForAnalysis(q)).unknown;
    const fix = unknown.length ? engine.fixQuery(q, isBool) : null;

    if (fix && !noAutoFix && count === 0) {
      if (execute(fix.text) > 0) {            // corrected query finds results: use it
        state.auto = { from: q, to: fix.text };
        state.used = fix.text;
        unknown = engine.analyze(queryForAnalysis(fix.text)).unknown;
      } else {
        execute(q);                           // correction found nothing either: restore
      }
    } else {
      state.fix = fix;                        // some results exist: only suggest
    }
    state.unknown = unknown;
    state.ms = performance.now() - t0;
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

  function linkButton(label, onClick) {
    const a = document.createElement("button");
    a.type = "button"; a.className = "dym-link"; a.textContent = label;
    a.addEventListener("click", onClick);
    return a;
  }

  function renderNotice() {
    els.dym.innerHTML = "";
    els.dym.hidden = true;
    if (state.auto) {
      const { from, to } = state.auto;
      els.dym.hidden = false;
      els.dym.append("Showing results for ");
      const b = document.createElement("b");
      b.textContent = to;
      els.dym.append(b, ". Search instead for ");
      els.dym.append(linkButton(from, () => {
        els.q.value = from; state.q = from; state.cat = ""; runSearch(true);
      }));
      els.dym.append(".");
    } else if (state.fix) {
      const text = state.fix.text;
      els.dym.hidden = false;
      els.dym.append("Did you mean: ");
      els.dym.append(linkButton(text, () => {
        els.q.value = text; state.q = text; state.cat = ""; runSearch();
      }));
      els.dym.append("?");
    }
  }

  function renderCompare() {
    const c = state.cmp;
    let msg = c.total + (c.total === 1 ? " matching document" : " matching documents") +
      " · " + state.ms.toFixed(1) + " ms";
    if (state.unknown.length) msg += " · not in index: " + state.unknown.join(", ");
    els.status.textContent = c.total ? msg : "No results" +
      (state.unknown.length ? " (not in index: " + state.unknown.join(", ") + ")" : "") +
      ". Try different words.";
    if (!c.total) return;

    const note = document.createElement("p");
    note.className = "cmp-note";
    note.textContent = "BM25 and TF-IDF share " + c.shared + " of their top 5 results. " +
      "The number next to each result is its rank in the other model.";

    const cols = [
      { title: "BM25", sub: "ranked by score",
        items: c.bm25.map(([id, s]) => [id, "score " + s.toFixed(2) + " · TF-IDF #" + (c.rankTfidf.get(id) || "–")]) },
      { title: "TF-IDF", sub: "ranked by cosine similarity",
        items: c.tfidf.map(([id, s]) => [id, "score " + s.toFixed(3) + " · BM25 #" + (c.rankBm25.get(id) || "–")]) },
      { title: "Boolean", sub: c.boolean.length + " documents contain every word (unranked, showing " +
        Math.min(5, c.boolean.length) + ")",
        items: c.boolTop.map((id) => [id, "unranked"]) },
    ];
    const grid = document.createElement("div");
    grid.className = "cmp-grid";
    for (const col of cols) {
      const sec = document.createElement("section");
      sec.className = "cmp-col";
      sec.innerHTML = "<h3>" + esc(col.title) + '</h3><p class="cmp-sub">' + esc(col.sub) + "</p>";
      if (!col.items.length) {
        const p = document.createElement("p");
        p.className = "cmp-sub"; p.textContent = "No matches. Boolean needs every word to appear.";
        sec.appendChild(p);
      } else {
        const ol = document.createElement("ol");
        for (const [id, info] of col.items) {
          const d = engine.docs[id];
          const li = document.createElement("li");
          li.innerHTML = '<a href="' + esc(d.u) + '" target="_blank" rel="noopener">' + esc(d.t) +
            '</a><div class="meta"><span class="badge">' + esc(d.c) + "</span><span>" + esc(info) + "</span></div>";
          ol.appendChild(li);
        }
        sec.appendChild(ol);
      }
      grid.appendChild(sec);
    }
    els.compare.hidden = false;
    els.compare.appendChild(note);
    els.compare.appendChild(grid);
  }

  function render() {
    els.hint.textContent = HINTS[state.model];
    els.main.classList.toggle("wide", state.model === "compare");
    renderExamples();
    els.compare.innerHTML = ""; els.compare.hidden = true;
    const q = state.q.trim();
    if (!q) {
      els.dym.innerHTML = ""; els.dym.hidden = true;
      els.status.textContent = ""; els.filters.innerHTML = "";
      els.results.innerHTML = ""; els.more.hidden = true; return;
    }
    renderNotice();
    if (state.model === "compare") {
      els.filters.innerHTML = ""; els.results.innerHTML = ""; els.more.hidden = true;
      renderCompare(); return;
    }

    const counts = new Map();
    for (const [id] of state.results) {
      const c = engine.docs[id].c;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    if (state.cat && !counts.has(state.cat)) state.cat = "";
    const filtered = state.cat
      ? state.results.filter(([id]) => engine.docs[id].c === state.cat) : state.results;

    let msg = filtered.length + (filtered.length === 1 ? " result" : " results");
    if (state.cat) msg += " in " + state.cat;
    msg += " · " + state.ms.toFixed(1) + " ms · " + (state.model === "boolean" ? "unranked" : "ranked");
    if (state.unknown.length) msg += " · not in index: " + state.unknown.join(", ");
    els.status.textContent = state.results.length ? msg
      : "No results" + (state.unknown.length ? " (not in index: " + state.unknown.join(", ") + ")" : "") +
        ". Try different words" + (state.model === "boolean" ? " or OR instead of AND." : ".");

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

    const hl = new Set(engine.analyze(queryForAnalysis(state.used || q)).qtf.keys());
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

  /* ---------- autocomplete ---------- */
  const lastWord = (v) => { const m = v.match(/[A-Za-z0-9]+$/); return m ? m[0] : ""; };

  function renderSuggest() {
    if (!els.suggest) return;
    els.suggest.innerHTML = "";
    els.suggest.hidden = sugItems.length === 0;
    const w = lastWord(els.q.value);
    sugItems.forEach((s, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      if (i === sugIndex) li.className = "active";
      li.innerHTML = "<b>" + esc(s.slice(0, w.length)) + "</b>" + esc(s.slice(w.length));
      li.addEventListener("mousedown", (e) => { e.preventDefault(); applySuggestion(s); });
      els.suggest.appendChild(li);
    });
  }

  function updateSuggest() {
    if (!engine) return;
    const w = lastWord(els.q.value);
    sugItems = w.length >= 2 ? engine.suggest(w, 6) : [];
    sugIndex = -1;
    renderSuggest();
  }

  function closeSuggest() { sugItems = []; sugIndex = -1; renderSuggest(); }

  function applySuggestion(s) {
    const v = els.q.value;
    els.q.value = v.slice(0, v.length - lastWord(v).length) + s + " ";
    closeSuggest();
    els.q.focus();
  }

  els.q.addEventListener("input", updateSuggest);
  els.q.addEventListener("blur", closeSuggest);
  els.q.addEventListener("keydown", (e) => {
    if (!sugItems.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); sugIndex = (sugIndex + 1) % sugItems.length; renderSuggest(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sugIndex = (sugIndex - 1 + sugItems.length) % sugItems.length; renderSuggest(); }
    else if (e.key === "Enter" && sugIndex >= 0) { e.preventDefault(); applySuggestion(sugItems[sugIndex]); }
    else if (e.key === "Tab") { e.preventDefault(); applySuggestion(sugItems[Math.max(sugIndex, 0)]); }
    else if (e.key === "Escape") { closeSuggest(); }
  });

  /* ---------- events ---------- */
  els.form.addEventListener("submit", (e) => {
    e.preventDefault(); closeSuggest();
    state.q = els.q.value; state.cat = ""; runSearch();
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
    if (MODELS.includes(p.get("model"))) {
      state.model = p.get("model");
      const radio = document.querySelector('input[value="' + state.model + '"]');
      if (radio) radio.checked = true;
    }
    state.q = p.get("q") || ""; state.cat = p.get("cat") || "";
    els.q.value = state.q;
    runSearch();
  }
  init();
})();