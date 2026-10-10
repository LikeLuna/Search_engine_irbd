const fs = require("fs");
const path = require("path");
const { Engine } = require("../web/search.js");

const dir = path.join(__dirname, "..", "web", "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const engine = new Engine(load("index.json"), load("docs.json"), load("lang.json"));
const expected = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

let checks = 0;
const failures = [];

function compareRanked(label, got, want) {
  checks++;
  if (got.length < want.length) { failures.push(`${label}: got ${got.length} results, want ${want.length}`); return; }
  for (let i = 0; i < want.length; i++) {
    const [gid, gs] = got[i], [wid, ws] = want[i];
    if (Math.abs(gs - ws) > 1e-6) { failures.push(`${label} rank ${i + 1}: score ${gs} vs ${ws}`); return; }
    const tie = (i > 0 && Math.abs(ws - want[i - 1][1]) < 1e-9) ||
                (i < want.length - 1 && Math.abs(ws - want[i + 1][1]) < 1e-9);
    if (gid !== wid && !tie) { failures.push(`${label} rank ${i + 1}: doc ${gid} vs ${wid}`); return; }
  }
}

for (const e of expected.ranked) {
  compareRanked(`bm25 "${e.q}"`, engine.bm25(e.q).slice(0, e.bm25.length), e.bm25);
  compareRanked(`tfidf "${e.q}"`, engine.tfidf(e.q).slice(0, e.tfidf.length), e.tfidf);
}
for (const e of expected.boolean) {
  checks++;
  const got = engine.boolean(e.q);
  if (JSON.stringify(got) !== JSON.stringify(e.ids)) {
    failures.push(`boolean "${e.q}": ${got.length} vs ${e.ids.length} results`);
  }
}

console.log(`${checks} comparisons, ${failures.length} failures`);
failures.forEach((f) => console.log("  FAIL " + f));
process.exit(failures.length ? 1 : 0);