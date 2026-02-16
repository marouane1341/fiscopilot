/* app.js — FiscoPilot AI ELITE MAX (robuste GH Pages + PWA)
   - Paths safe for /fiscopilot/
   - Loads multiple db sources
   - Normalizes schemas: courses/lessons/cours, content/text
   - Random + prev/next stable
*/

const APP = {
  state: {
    page: "modules", // modules | module
    modules: [],
    activeModule: null,
    activeCourseIndex: 0
  }
};

/* ---------- PATH HELPERS (GitHub Pages safe) ---------- */
function basePath() {
  // If hosted on https://marouane1341.github.io/fiscopilot/
  // then window.location.pathname starts with "/fiscopilot/..."
  const p = window.location.pathname || "/";
  const parts = p.split("/").filter(Boolean);
  // repo name = first segment (fiscopilot)
  const repo = parts.length ? parts[0] : "";
  return repo ? `/${repo}/` : "/";
}

function joinUrl(rel) {
  // rel like "db/tva.json" -> "/fiscopilot/db/tva.json"
  const b = basePath();
  if (rel.startsWith("/")) return rel; // already absolute
  return b + rel.replace(/^\.?\//, "");
}

async function fetchJSONSmart(rel) {
  // try multiple variants to survive different hosting / caching
  const tries = [
    joinUrl(rel),         // /fiscopilot/db/...
    rel,                  // db/...
    "./" + rel.replace(/^\/+/, ""), // ./db/...
  ];

  let lastErr = null;
  for (const url of tries) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("fetchJSONSmart failed");
}

/* ---------- NORMALIZATION (schema compatibility MAX) ---------- */
function normalizeModuleObject(raw, sourceName) {
  // raw could be a "module db" file or already module-shaped
  // We expect: meta.title, courses/lessons/cours, qcm, cases
  const meta = raw.meta || {};
  const title = meta.title || raw.title || sourceName || "Module";
  const version = meta.version ?? raw.version ?? 1;

  const courses =
    raw.courses ||
    raw.lessons ||
    raw.cours ||
    raw.course ||
    [];

  const normCourses = Array.isArray(courses) ? courses.map((c, idx) => {
    const id = c.id || `c_${idx+1}`;
    const ct = c.content ?? c.text ?? c.body ?? "";
    const level = c.level ?? c.difficulty ?? "";
    const t = c.title ?? c.name ?? `Cours ${idx+1}`;
    return { id, title: t, level, content: String(ct || "") };
  }) : [];

  const qcm = Array.isArray(raw.qcm) ? raw.qcm.map((q, idx) => {
    return {
      level: q.level ?? "",
      question: q.question ?? q.q ?? `Question ${idx+1}`,
      choices: q.choices ?? q.options ?? [],
      answer: Number.isFinite(q.answer) ? q.answer : (q.correct ?? 0),
      explain: q.explain ?? q.explanation ?? q.a ?? ""
    };
  }) : [];

  const cases = Array.isArray(raw.cases) ? raw.cases.map((c, idx) => {
    return {
      title: c.title ?? `Cas ${idx+1}`,
      level: c.level ?? "",
      question: c.question ?? "",
      answer_md: c.answer_md ?? c.answer ?? ""
    };
  }) : [];

  return {
    id: raw.id || sourceName || title.replace(/\s+/g, "_").toLowerCase(),
    title,
    version,
    source: sourceName || "",
    courses: normCourses,
    qcm,
    cases
  };
}

function pickRandomIndex(max) {
  if (max <= 0) return 0;
  return Math.floor(Math.random() * max);
}

/* ---------- DB INDEX LOADING ---------- */
async function loadDbIndex() {
  // Expected db_index.json format examples:
  // { "modules":[ { "id":"tva", "title":"TVA Belgique", "sources":["db/tva.json","db/tva_1_fondations.json"] } ] }
  // or older: { "sources":["db/tva.json", ...] } for one module
  try {
    const idx = await fetchJSONSmart("db_index.json");
    return idx;
  } catch (e) {
    // fallback: if no index, try default known names
    return {
      modules: [
        {
          id: "tva",
          title: "TVA Belgique",
          sources: [
            "db/tva.json",
            "db/tva_1_fondations.json",
            "db/tva_2_pratique.json",
            "db/tva_3_expert.json"
          ]
        }
      ]
    };
  }
}

async function buildModulesFromIndex() {
  const idx = await loadDbIndex();

  // Case A: modern modules array
  if (Array.isArray(idx.modules) && idx.modules.length) {
    const out = [];
    for (const m of idx.modules) {
      const sources = m.sources || m.files || [];
      const merged = await loadAndMergeSources(sources, m.title || m.id);
      merged.id = m.id || merged.id;
      merged.title = m.title || merged.title;
      out.push(merged);
    }
    return out;
  }

  // Case B: single module sources
  const sources = idx.sources || idx.files || [];
  if (sources.length) {
    return [await loadAndMergeSources(sources, "Module")];
  }

  // fallback final
  return [await loadAndMergeSources([
    "db/tva.json",
    "db/tva_1_fondations.json",
    "db/tva_2_pratique.json",
    "db/tva_3_expert.json"
  ], "TVA Belgique")];
}

async function loadAndMergeSources(sources, moduleName) {
  const merged = {
    id: moduleName.replace(/\s+/g, "_").toLowerCase(),
    title: moduleName,
    version: 1,
    source: sources.join(" + "),
    courses: [],
    qcm: [],
    cases: []
  };

  for (const s of sources) {
    try {
      const raw = await fetchJSONSmart(s);
      const nm = normalizeModuleObject(raw, s);
      merged.courses.push(...nm.courses);
      merged.qcm.push(...nm.qcm);
      merged.cases.push(...nm.cases);
      merged.version = Math.max(merged.version, nm.version || 1);
    } catch (e) {
      console.warn("Source load failed:", s, e);
    }
  }

  // de-dup courses by id
  const seen = new Set();
  merged.courses = merged.courses.filter(c => {
    const key = c.id + "::" + c.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return merged;
}

/* ---------- UI RENDER ---------- */
function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function setRoot(node) {
  const root = document.getElementById("app");
  root.innerHTML = "";
  root.appendChild(node);
}

function renderTopBar() {
  return el(`
    <div class="topbar">
      <button class="iconBtn" id="menuBtn" aria-label="Menu">☰</button>
      <div class="brand">
        <div class="brandTitle">FiscoPilot <span class="gold">AI ELITE MAX</span> 🇧🇪</div>
        <div class="brandSub">Mode PWA • Offline-ready</div>
      </div>
      <button class="pill" id="onlinePill">En ligne</button>
    </div>
  `);
}

function renderModulesPage() {
  const wrap = el(`<div class="page"></div>`);
  wrap.appendChild(renderTopBar());

  const content = el(`
    <div class="content">
      <h1>Modules</h1>
      <div class="cards" id="modCards"></div>
      <div class="muted" id="loadMsg">Chargement…</div>
    </div>
  `);
  wrap.appendChild(content);

  const cards = content.querySelector("#modCards");
  const msg = content.querySelector("#loadMsg");

  if (APP.state.modules.length) {
    msg.remove();
    for (const m of APP.state.modules) {
      const card = el(`
        <div class="card moduleCard">
          <div class="row">
            <div class="icon">📚</div>
            <div class="grow">
              <div class="cardTitle">${escapeHtml(m.title)}</div>
              <div class="cardSub">Appuie pour ouvrir</div>
            </div>
          </div>
        </div>
      `);
      card.addEventListener("click", () => {
        APP.state.activeModule = m;
        APP.state.activeCourseIndex = 0;
        APP.state.page = "module";
        render();
      });
      cards.appendChild(card);
    }
  } else {
    msg.textContent = "Aucun module chargé (vérifie db_index.json ou les sources db/*.json).";
  }

  return wrap;
}

function renderModulePage() {
  const m = APP.state.activeModule;
  const wrap = el(`<div class="page"></div>`);
  wrap.appendChild(renderTopBar());

  const totalC = m.courses.length;
  const totalQ = m.qcm.length;
  const totalCase = m.cases.length;

  const current = m.courses[APP.state.activeCourseIndex] || null;
  const courseTitle = current ? `${APP.state.activeCourseIndex + 1}/${totalC} ${current.title} ${current.level ? `(${current.level})` : ""}` : "Aucun cours";
  const courseBody = current ? current.content : "Aucun contenu.";

  const content = el(`
    <div class="content">
      <div class="moduleHeader">
        <div class="moduleName">${escapeHtml(m.title)}</div>
        <div class="moduleMeta">Cours: ${totalC} • QCM: ${totalQ} • Cas: ${totalCase} • Sources: ${escapeHtml(m.source)}</div>
        <div class="chips">
          <div class="chip">📚 ${totalC} cours</div>
          <div class="chip">🧪 ${totalQ} QCM</div>
          <div class="chip">🧾 ${totalCase} cas</div>
        </div>
      </div>

      <div class="actionsRow">
        <button class="btn soft" id="backBtn">← Retour</button>
      </div>

      <div class="card">
        <div class="cardTitle">Cours</div>
        <div class="btnRow">
          <button class="btn soft" id="rndCourse">Cours aléatoire</button>
          <button class="btn soft" id="prevCourse">◀ Précédent</button>
          <button class="btn" id="nextCourse">Suivant ▶</button>
        </div>

        <div class="list" id="courseList"></div>

        <div class="divider"></div>

        <div class="courseBox">
          <div class="courseTitle">${escapeHtml(courseTitle)}</div>
          <pre class="courseText">${escapeHtml(courseBody)}</pre>
        </div>
      </div>

      <div class="card">
        <div class="cardTitle">QCM</div>
        <div class="btnRow">
          <button class="btn soft" id="qcm5">Lancer 5 questions (aléatoire)</button>
          <button class="btn soft" id="qcm10">Lancer 10 questions (aléatoire)</button>
        </div>
        <div class="muted">Appuie sur “Lancer” pour démarrer un QCM aléatoire.</div>
        <div id="qcmArea"></div>
      </div>

      <div class="card">
        <div class="cardTitle">Cas pratiques</div>
        <div class="btnRow">
          <button class="btn soft" id="caseRnd">Cas aléatoire</button>
        </div>
        <div class="muted">Appuie sur “Cas aléatoire”.</div>
        <div id="caseArea"></div>
      </div>
    </div>
  `);

  wrap.appendChild(content);

  // list of courses (compact)
  const list = content.querySelector("#courseList");
  const maxList = Math.min(12, totalC);
  for (let i = 0; i < maxList; i++) {
    const c = m.courses[i];
    const row = el(`<button class="listItem">${i+1}. ${escapeHtml(c.title)} ${c.level ? `<span class="pillSmall">${escapeHtml(c.level)}</span>` : ""}</button>`);
    row.addEventListener("click", () => {
      APP.state.activeCourseIndex = i;
      render();
    });
    list.appendChild(row);
  }
  if (totalC > maxList) {
    list.appendChild(el(`<div class="muted">… +${totalC - maxList} autres cours (utilise Précédent/Suivant ou Aléatoire)</div>`));
  }

  // buttons
  content.querySelector("#backBtn").addEventListener("click", () => {
    APP.state.page = "modules";
    APP.state.activeModule = null;
    render();
  });

  content.querySelector("#rndCourse").addEventListener("click", () => {
    if (!totalC) return;
    APP.state.activeCourseIndex = pickRandomIndex(totalC);
    render();
  });

  content.querySelector("#prevCourse").addEventListener("click", () => {
    if (!totalC) return;
    APP.state.activeCourseIndex = (APP.state.activeCourseIndex - 1 + totalC) % totalC;
    render();
  });

  content.querySelector("#nextCourse").addEventListener("click", () => {
    if (!totalC) return;
    APP.state.activeCourseIndex = (APP.state.activeCourseIndex + 1) % totalC;
    render();
  });

  // QCM
  const qcmArea = content.querySelector("#qcmArea");
  content.querySelector("#qcm5").addEventListener("click", () => runQCM(m, 5, qcmArea));
  content.querySelector("#qcm10").addEventListener("click", () => runQCM(m, 10, qcmArea));

  // Cases
  const caseArea = content.querySelector("#caseArea");
  content.querySelector("#caseRnd").addEventListener("click", () => {
    caseArea.innerHTML = "";
    if (!m.cases.length) {
      caseArea.appendChild(el(`<div class="muted">Aucun cas disponible.</div>`));
      return;
    }
    const c = m.cases[pickRandomIndex(m.cases.length)];
    const card = el(`
      <div class="caseBox">
        <div class="courseTitle">${escapeHtml(c.title)} ${c.level ? `(${escapeHtml(c.level)})` : ""}</div>
        <div class="muted">${escapeHtml(c.question || "")}</div>
        <button class="btn soft" id="seeAns">Voir correction</button>
        <pre class="courseText" id="ans" style="display:none;"></pre>
      </div>
    `);
    card.querySelector("#seeAns").addEventListener("click", () => {
      const a = card.querySelector("#ans");
      a.style.display = "block";
      a.textContent = (c.answer_md || "").replace(/\r/g, "");
    });
    caseArea.appendChild(card);
  });

  return wrap;
}

function runQCM(m, n, mount) {
  mount.innerHTML = "";
  if (!m.qcm.length) {
    mount.appendChild(el(`<div class="muted">Aucun QCM disponible.</div>`));
    return;
  }
  const picked = [];
  const pool = [...m.qcm];
  while (picked.length < n && pool.length) {
    const i = pickRandomIndex(pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }

  let idx = 0;
  let score = 0;

  const box = el(`<div class="qcmBox"></div>`);
  mount.appendChild(box);

  function renderQ() {
    box.innerHTML = "";
    const q = picked[idx];
    box.appendChild(el(`<div class="courseTitle">(${idx+1}/${picked.length}) ${escapeHtml(q.question)}</div>`));

    const choices = el(`<div class="choiceList"></div>`);
    (q.choices || []).forEach((c, i) => {
      const b = el(`<button class="listItem">${escapeHtml(String(c))}</button>`);
      b.addEventListener("click", () => {
        const ok = (i === q.answer);
        if (ok) score++;
        box.appendChild(el(`<div class="${ok ? "ok" : "bad"}">${ok ? "✅ Correct" : "❌ Faux"}</div>`));
        if (q.explain) box.appendChild(el(`<div class="muted">${escapeHtml(q.explain)}</div>`));
        nextBtn.disabled = false;
        Array.from(choices.querySelectorAll("button")).forEach(x => x.disabled = true);
      });
      choices.appendChild(b);
    });
    box.appendChild(choices);

    const nextBtn = el(`<button class="btn" disabled>${idx === picked.length-1 ? "Terminer" : "Suivant"}</button>`);
    nextBtn.addEventListener("click", () => {
      idx++;
      if (idx >= picked.length) {
        box.innerHTML = "";
        box.appendChild(el(`<div class="courseTitle">Score : ${score}/${picked.length}</div>`));
        return;
      }
      renderQ();
    });
    box.appendChild(nextBtn);
  }

  renderQ();
}

/* ---------- BASIC STYLES (premium-ish) ---------- */
function injectStyles() {
  if (document.getElementById("fpStyles")) return;
  const s = document.createElement("style");
  s.id = "fpStyles";
  s.textContent = `
    :root{
      --bg1:#06152a;
      --bg2:#030a14;
      --card: rgba(255,255,255,.06);
      --stroke: rgba(255,255,255,.08);
      --text: rgba(255,255,255,.92);
      --muted: rgba(255,255,255,.62);
      --gold: #d6b15b;
      --blue: rgba(64,124,255,.22);
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
      color:var(--text);
      background: radial-gradient(1200px 600px at 20% 0%, #0a2c5b 0%, var(--bg1) 35%, var(--bg2) 100%);
    }
    pre{white-space:pre-wrap; word-wrap:break-word}
    .page{min-height:100vh}
    .topbar{
      position:sticky; top:0; z-index:5;
      display:flex; gap:12px; align-items:center;
      padding:14px 14px;
      background: rgba(4,10,20,.72);
      backdrop-filter: blur(12px);
      border-bottom:1px solid var(--stroke);
    }
    .iconBtn{
      width:44px;height:44px;border-radius:14px;
      border:1px solid var(--stroke);
      background: rgba(255,255,255,.06);
      color:var(--text);
      font-size:20px;
    }
    .brand{flex:1}
    .brandTitle{font-weight:800; letter-spacing:.2px}
    .brandSub{font-size:12px; color:var(--muted); margin-top:2px}
    .gold{color:var(--gold)}
    .pill{
      border:1px solid var(--stroke);
      background: rgba(255,255,255,.05);
      color:var(--text);
      padding:10px 12px;
      border-radius:999px;
      font-weight:700;
    }
    .content{padding:16px 14px 30px; max-width:980px; margin:0 auto}
    h1{margin:10px 0 14px; font-size:42px; letter-spacing:-.6px}
    .cards{display:grid; gap:14px}
    .card{
      border:1px solid var(--stroke);
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.04));
      border-radius:18px;
      padding:14px;
      box-shadow: 0 20px 40px rgba(0,0,0,.25);
    }
    .moduleCard{cursor:pointer}
    .row{display:flex; align-items:center; gap:12px}
    .icon{font-size:22px}
    .grow{flex:1}
    .cardTitle{font-weight:800; font-size:18px}
    .cardSub{color:var(--muted); font-size:13px; margin-top:2px}
    .muted{color:var(--muted); margin-top:8px}
    .moduleHeader{margin-top:6px}
    .moduleName{font-size:30px; font-weight:900; margin:4px 0}
    .moduleMeta{color:var(--muted); font-size:13px}
    .chips{display:flex; gap:8px; flex-wrap:wrap; margin-top:10px}
    .chip{
      border:1px solid var(--stroke);
      background: rgba(255,255,255,.04);
      padding:8px 10px;
      border-radius:999px;
      font-weight:700;
      font-size:13px;
    }
    .actionsRow{margin:12px 0}
    .btnRow{display:flex; gap:10px; flex-wrap:wrap; margin:10px 0}
    .btn{
      border:1px solid rgba(110,160,255,.35);
      background: linear-gradient(180deg, rgba(64,124,255,.28), rgba(64,124,255,.18));
      color:var(--text);
      padding:12px 14px;
      border-radius:14px;
      font-weight:800;
    }
    .btn.soft{
      border:1px solid var(--stroke);
      background: rgba(255,255,255,.05);
      font-weight:800;
    }
    .divider{height:1px; background: var(--stroke); margin:12px 0}
    .list{display:flex; flex-direction:column; gap:8px}
    .listItem{
      text-align:left;
      border:1px solid var(--stroke);
      background: rgba(255,255,255,.04);
      color:var(--text);
      padding:12px 12px;
      border-radius:14px;
      font-weight:700;
    }
    .pillSmall{
      margin-left:8px;
      display:inline-block;
      padding:4px 8px;
      border-radius:999px;
      border:1px solid var(--stroke);
      background: rgba(255,255,255,.04);
      font-size:12px;
      color:var(--muted);
      font-weight:800;
    }
    .courseBox{margin-top:10px}
    .courseTitle{font-weight:900; font-size:16px; margin-bottom:8px}
    .courseText{
      margin:0;
      border:1px solid var(--stroke);
      background: rgba(0,0,0,.18);
      padding:12px;
      border-radius:14px;
      color:rgba(255,255,255,.86);
    }
    .qcmBox, .caseBox{margin-top:10px}
    .choiceList{display:flex; flex-direction:column; gap:8px; margin:10px 0}
    .ok{margin-top:10px; font-weight:900; color:#9cffb5}
    .bad{margin-top:10px; font-weight:900; color:#ff9c9c}
  `;
  document.head.appendChild(s);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- APP BOOT ---------- */
async function init() {
  injectStyles();

  try {
    APP.state.modules = await buildModulesFromIndex();
  } catch (e) {
    console.error("Modules load error:", e);
    APP.state.modules = [];
  }

  render();
}

function render() {
  if (APP.state.page === "module" && APP.state.activeModule) {
    setRoot(renderModulePage());
  } else {
    setRoot(renderModulesPage());
  }
}

window.addEventListener("load", init);