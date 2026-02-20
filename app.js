/* ================================
   FiscoPilot Stable v100
   - zéro "onclick null"
   - DB JSON safe
   - Modal lecteur + TTS
   ================================ */

const APP_BUILD = 100;

const state = {
  dbIndex: null,
  currentModule: null,
  moduleData: { lessons: [], qcm: [], cases: [] },
  tab: "lessons",      // lessons | qcm | cases
  filter: "",
  readerList: [],
  readerIndex: 0,
  speaking: false
};

/* ---------- Utils ---------- */
const $ = (id) => document.getElementById(id);

function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function pickLevelBadge(levelText) {
  const t = (levelText || "").toLowerCase();
  if (t.includes("début") || t.includes("debut")) return "green";
  if (t.includes("inter")) return "orange";
  if (t.includes("expert") || t.includes("avancé") || t.includes("avance") || t.includes("🔴")) return "red";
  return "";
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.json();
}

/* ---------- Drawer ---------- */
function openDrawer() {
  const d = $("drawer");
  if (d) d.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  const d = $("drawer");
  if (d) d.setAttribute("aria-hidden", "true");
}

/* ---------- Modal ---------- */
function openModal() {
  const m = $("modal");
  if (m) m.setAttribute("aria-hidden", "false");
}
function closeModal() {
  stopTTS();
  const m = $("modal");
  if (m) m.setAttribute("aria-hidden", "true");
}

/* ---------- Force Refresh ---------- */
async function killAllCachesAndSW() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {}
}

/* ---------- Online pill ---------- */
function updateNet() {
  const pill = $("netPill");
  if (!pill) return;

  if (navigator.onLine) {
    pill.textContent = "En ligne";
    pill.classList.remove("offline");
    pill.classList.add("online");
  } else {
    pill.textContent = "Hors ligne";
    pill.classList.remove("online");
    pill.classList.add("offline");
  }
}

/* ---------- Build ---------- */
function updateBuild() {
  setText("buildNum", APP_BUILD);
}

/* ---------- Render Pages ---------- */

function renderError(err) {
  const app = $("app");
  if (!app) return;

  app.innerHTML = `
    <div class="card">
      <h2>Erreur</h2>
      <p class="small">${escapeHtml(err?.message || String(err))}</p>
      <div style="height:12px"></div>
      <button class="btn primary" id="btnReload">Recharger</button>
    </div>
  `;

  const btn = $("btnReload");
  if (btn) btn.onclick = () => location.reload();
}

function renderHome() {
  const app = $("app");
  if (!app) return;

  const mods = state.dbIndex?.modules || [];
  const cards = mods.map((m) => {
    const sources = (m.sources || []).join(", ");
    return `
      <div class="moduleCard">
        <div class="row">
          <div>
            <div class="moduleTitle">📚 ${escapeHtml(m.title || m.id || "Module")}</div>
            <div class="small">Sources: ${escapeHtml(sources)}</div>
          </div>
          <button class="btn primary" data-open="${escapeHtml(m.id)}">Ouvrir</button>
        </div>
      </div>
    `;
  }).join("");

  app.innerHTML = `
    <div class="card">
      <h2>Modules</h2>
      <p>Choisis un module. Les cours premium ont un objectif, une explication claire, un exemple, “à retenir”, et peuvent être lus en audio.</p>
    </div>
    <div style="height:12px"></div>
    <div class="grid">${cards || `<div class="card"><p>Aucun module trouvé dans db_index.json</p></div>`}</div>
  `;

  // Bind open buttons (safe)
  app.querySelectorAll("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open");
      const module = mods.find(x => x.id === id);
      if (module) openModule(module);
    });
  });
}

function renderModule() {
  const app = $("app");
  if (!app) return;

  const m = state.currentModule;
  const { lessons, qcm, cases } = state.moduleData;

  const counts = `Cours: ${lessons.length} • QCM: ${qcm.length} • Cas: ${cases.length}`;
  const sources = (m?.sources || []).join(", ");

  app.innerHTML = `
    <div class="moduleCard">
      <div class="row">
        <div>
          <div class="moduleTitle">📘 ${escapeHtml(m?.title || "Module")}</div>
          <div class="small">${escapeHtml(counts)}<br/>Sources: ${escapeHtml(sources)}</div>
        </div>
        <button class="btn ghost" id="btnBack">← Retour</button>
      </div>

      <div class="tabs">
        <button class="tabBtn ${state.tab==="lessons"?"active":""}" id="tabLessons">📘 Cours</button>
        <button class="tabBtn ${state.tab==="qcm"?"active":""}" id="tabQcm">🧪 QCM</button>
        <button class="tabBtn ${state.tab==="cases"?"active":""}" id="tabCases">📝 Cas</button>
      </div>

      <div class="tools">
        <input class="search" id="search" placeholder="Rechercher (ex: prorata, facture, intracom)" value="${escapeHtml(state.filter)}" />
        <button class="btn primary" id="btnRandom">Aléatoire</button>
      </div>
    </div>

    <div class="list" id="list"></div>
  `;

  // Bind
  $("btnBack").onclick = () => { state.currentModule = null; renderHome(); };
  $("tabLessons").onclick = () => { state.tab="lessons"; renderModule(); };
  $("tabQcm").onclick = () => { state.tab="qcm"; renderModule(); };
  $("tabCases").onclick = () => { state.tab="cases"; renderModule(); };

  $("search").oninput = (e) => {
    state.filter = e.target.value || "";
    renderList();
  };

  $("btnRandom").onclick = () => openRandom();

  renderList();
}

function renderList() {
  const list = $("list");
  if (!list) return;

  const f = state.filter.trim().toLowerCase();
  const { lessons, qcm, cases } = state.moduleData;

  let items = [];
  if (state.tab === "lessons") items = lessons.map((x, i) => ({ type:"lesson", i, ...x }));
  if (state.tab === "qcm") items = qcm.map((x, i) => ({ type:"qcm", i, ...x }));
  if (state.tab === "cases") items = cases.map((x, i) => ({ type:"case", i, ...x }));

  if (f) {
    items = items.filter(it => {
      const hay = JSON.stringify(it).toLowerCase();
      return hay.includes(f);
    });
  }

  if (!items.length) {
    list.innerHTML = `<div class="card"><p>Aucun résultat.</p></div>`;
    return;
  }

  list.innerHTML = items.map((it, idx) => {
    const title = it.type==="lesson" ? it.title :
                  it.type==="qcm" ? it.question :
                  it.title || it.question || "Cas";

    const level = it.level || (it.type==="qcm" ? (it.level || "") : "");
    const badgeClass = pickLevelBadge(level);
    const lvlLabel = level || (it.type==="qcm" ? "QCM" : "");

    const tag1 = state.tab==="lessons" ? "Cours premium" :
                 state.tab==="qcm" ? "QCM" : "Cas pratique";

    return `
      <div class="item">
        <div>
          <h3>${escapeHtml(title || "")}</h3>
          <div class="badges">
            ${lvlLabel ? `<span class="badge ${badgeClass}">${escapeHtml(lvlLabel)}</span>` : ""}
            <span class="badge">📌 ${escapeHtml(state.currentModule?.title || "Module")}</span>
            <span class="badge">⭐ ${escapeHtml(tag1)}</span>
          </div>
        </div>
        <div class="itemActions">
          <button class="openBtn" data-open="${it.type}:${it.i}">Ouvrir</button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [type, si] = btn.getAttribute("data-open").split(":");
      const i = Number(si);
      openReader(type, i);
    });
  });
}

/* ---------- Reader + Content ---------- */

function lessonToPremiumBlocks(lesson) {
  // 1) Si déjà au format "structuré"
  const blocks = [];
  if (lesson.objective) blocks.push({ title: "OBJECTIF", body: lesson.objective });
  if (lesson.explanation) blocks.push({ title: "EXPLICATION", body: lesson.explanation });
  if (lesson.example) blocks.push({ title: "EXEMPLE", body: lesson.example, mono: true });
  if (lesson.retenir) blocks.push({ title: "À RETENIR", body: lesson.retenir });

  if (blocks.length) return blocks;

  // 2) Sinon : texte brut => on découpe automatiquement par sections
  const raw = (lesson.text || lesson.content || lesson.body || "").trim();
  if (!raw) return [{ title: "CONTENU", body: "" }];

  // normalisation (évite les bugs accents / casse)
  const txt = raw
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  // titres reconnus
  const headings = [
    "OBJECTIF",
    "EXPLICATION",
    "MÉTHODE",
    "METHODE",
    "EXEMPLE",
    "PIÈGE",
    "PIEGE",
    "À RETENIR",
    "A RETENIR",
    "CHECKLIST",
    "SCHÉMA",
    "SCHEMA",
    "MINI-EXERCICE",
    "EXERCICE",
    "CORRIGÉ",
    "CORRIGE"
  ];

  // On découpe par "titre" en début de ligne
  const lines = txt.split("\n");
  let currentTitle = null;
  let buffer = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (!body) { buffer = []; return; }
    blocks.push({
      title: currentTitle || "CONTENU",
      body,
      mono: currentTitle === "EXEMPLE" || currentTitle === "CORRIGÉ" || currentTitle === "CORRIGE"
    });
    buffer = [];
  };

  for (const line of lines) {
    const l = line.trim();
    const up = l.toUpperCase();

    // match exact heading (avec ou sans ":")
    const isHeading = headings.some(h => up === h || up === (h + ":"));
    if (isHeading) {
      flush();
      currentTitle = up.replace(/:$/, "");
      continue;
    }
    buffer.push(line);
  }
  flush();

  // Si rien reconnu, on laisse en CONTENU
  if (!blocks.length) return [{ title: "CONTENU", body: txt }];

  return blocks;
}

  if (lesson.objective) blocks.push({ title:"OBJECTIF", body: lesson.objective });
  if (lesson.explanation) blocks.push({ title:"EXPLICATION", body: lesson.explanation });
  if (lesson.example) blocks.push({ title:"EXEMPLE", body: lesson.example, mono:true });
  if (lesson.retenir) blocks.push({ title:"À RETENIR", body: lesson.retenir });

  if (!blocks.length) {
    blocks.push({ title:"CONTENU", body: lesson.text || "" });
  }
  return blocks;
}

function renderLesson(lesson) {
  const blocks = lessonToPremiumBlocks(lesson);
  return `
    <div class="block">
      <h4>${escapeHtml(lesson.title || "Cours")}</h4>
      <p class="small">${escapeHtml(lesson.level || "")}</p>
    </div>
    ${blocks.map(b => `
      <div class="block">
        <h4>${escapeHtml(b.title)}</h4>
        ${b.mono
          ? `<div class="kbd">${escapeHtml(b.body).replaceAll("\n","<br>")}</div>`
          : `<p>${escapeHtml(b.body).replaceAll("\n","<br>")}</p>`
        }
      </div>
    `).join("")}
  `;
}

function renderQcm(q) {
  const choices = (q.choices || []).map((c, idx) => `<li>${escapeHtml(c)}</li>`).join("");
  return `
    <div class="block">
      <h4>QCM</h4>
      <p><b>${escapeHtml(q.question || "")}</b></p>
    </div>
    <div class="block">
      <h4>CHOIX</h4>
      <ul>${choices}</ul>
    </div>
    <div class="block">
      <h4>RÉPONSE</h4>
      <p>Bonne réponse : <b>${(q.answer ?? 0) + 1}</b></p>
      <p>${escapeHtml(q.explain || "")}</p>
    </div>
  `;
}

function renderCase(c) {
  return `
    <div class="block">
      <h4>${escapeHtml(c.title || "Cas pratique")}</h4>
      <p class="small">${escapeHtml(c.level || "")}</p>
    </div>
    <div class="block">
      <h4>QUESTION</h4>
      <p>${escapeHtml(c.question || "")}</p>
    </div>
    <div class="block">
      <h4>CORRIGÉ</h4>
      <div class="kbd">${escapeHtml(c.answer_md || "").replaceAll("\n","<br>")}</div>
    </div>
  `;
}

function currentReaderItem() {
  return state.readerList[state.readerIndex];
}

function openReader(type, index) {
  stopTTS();

  const data = state.moduleData;
  let list = [];
  if (type === "lesson") list = data.lessons.map((x, i) => ({ type, i, x }));
  if (type === "qcm") list = data.qcm.map((x, i) => ({ type, i, x }));
  if (type === "case") list = data.cases.map((x, i) => ({ type, i, x }));

  state.readerList = list;
  state.readerIndex = Math.max(0, Math.min(index, list.length - 1));

  renderReader();
  openModal();
}

function renderReader() {
  const it = currentReaderItem();
  if (!it) return;

  const body = $("modalBody");
  if (!body) return;

  const total = state.readerList.length;
  setText("modalPos", `${state.readerIndex + 1}/${total}`);
  setText("modalLevel", it.x.level || (it.type === "qcm" ? (it.x.level || "QCM") : "") || " ");

  if (it.type === "lesson") body.innerHTML = renderLesson(it.x);
  if (it.type === "qcm") body.innerHTML = renderQcm(it.x);
  if (it.type === "case") body.innerHTML = renderCase(it.x);
}

/* ---------- Random ---------- */
function openRandom() {
  const { lessons, qcm, cases } = state.moduleData;
  let type = state.tab === "lessons" ? "lesson" : state.tab === "qcm" ? "qcm" : "case";
  let max = type==="lesson" ? lessons.length : type==="qcm" ? qcm.length : cases.length;
  if (!max) return;
  const i = Math.floor(Math.random() * max);
  openReader(type, i);
}

/* ---------- TTS (Option 1 : Web Speech API) ---------- */
function canTTS() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function getReadableTextFromModal() {
  const body = $("modalBody");
  if (!body) return "";
  // texte brut sans HTML
  return body.innerText || "";
}

function pickBestVoiceFR() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  // Priorité : fr-BE / fr-FR
  return (
    voices.find(v => (v.lang || "").toLowerCase().startsWith("fr-be")) ||
    voices.find(v => (v.lang || "").toLowerCase().startsWith("fr-fr")) ||
    voices.find(v => (v.lang || "").toLowerCase().startsWith("fr")) ||
    voices[0] ||
    null
  );
}

function startTTS() {
  if (!canTTS()) {
    alert("Audio non supporté sur ce navigateur.");
    return;
  }

  stopTTS();

  const text = getReadableTextFromModal().trim();
  if (!text) return;

  const u = new SpeechSynthesisUtterance(text);
  const v = pickBestVoiceFR();
  if (v) u.voice = v;

  u.rate = 1.0;
  u.pitch = 1.0;
  u.volume = 1.0;

  u.onend = () => {
    state.speaking = false;
    const b = $("ttsBtn");
    if (b) b.textContent = "🔊 Lire";
  };

  state.speaking = true;
  const b = $("ttsBtn");
  if (b) b.textContent = "⏸ Pause";

  window.speechSynthesis.speak(u);
}

function pauseResumeTTS() {
  if (!canTTS()) return;

  if (!state.speaking) {
    startTTS();
    return;
  }

  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    const b = $("ttsBtn");
    if (b) b.textContent = "⏸ Pause";
  } else {
    window.speechSynthesis.pause();
    const b = $("ttsBtn");
    if (b) b.textContent = "▶ Reprendre";
  }
}

function stopTTS() {
  if (!canTTS()) return;
  try { window.speechSynthesis.cancel(); } catch(e){}
  state.speaking = false;
  const b = $("ttsBtn");
  if (b) b.textContent = "🔊 Lire";
}

/* ---------- Load Module ---------- */
async function openModule(moduleDef) {
  try {
    state.currentModule = moduleDef;
    state.tab = "lessons";
    state.filter = "";

    // charge toutes les sources puis merge
    const merged = { lessons: [], qcm: [], cases: [] };

    for (const src of (moduleDef.sources || [])) {
      const data = await fetchJson(src);

      if (Array.isArray(data.lessons)) merged.lessons.push(...data.lessons);
      if (Array.isArray(data.qcm)) merged.qcm.push(...data.qcm);
      if (Array.isArray(data.cases)) merged.cases.push(...data.cases);
    }

    state.moduleData = merged;
    renderModule();
  } catch (e) {
    renderError(e);
  }
}

/* ---------- App Init ---------- */
async function init() {
  // Build / net
  updateBuild();
  updateNet();
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);

  // Bind UI (TOUS safe car IDs existent dans index.html)
  $("btnMenu").onclick = openDrawer;
  $("btnClose").onclick = closeDrawer;
  $("modalMenu").onclick = openDrawer;

  $("navModules").onclick = () => { closeDrawer(); renderHome(); };
  $("navForceRefresh").onclick = async () => {
    closeDrawer();
    await killAllCachesAndSW();
    location.reload();
  };

  $("modalClose").onclick = closeModal;

  $("prevBtn").onclick = () => {
    stopTTS();
    state.readerIndex = Math.max(0, state.readerIndex - 1);
    renderReader();
  };

  $("nextBtn").onclick = () => {
    stopTTS();
    state.readerIndex = Math.min(state.readerList.length - 1, state.readerIndex + 1);
    renderReader();
  };

  $("ttsBtn").onclick = () => pauseResumeTTS();

  // SW
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Load db index
  try {
    state.dbIndex = await fetchJson("db_index.json");
    renderHome();
  } catch (e) {
    renderError(new Error("Impossible de charger db_index.json. Vérifie qu'il est à la racine et valide JSON."));
  }

  // Click outside drawer to close (simple)
  document.addEventListener("click", (ev) => {
    const d = $("drawer");
    if (!d) return;
    if (d.getAttribute("aria-hidden") === "true") return;

    const isInside = d.contains(ev.target);
    const isMenuBtn = $("btnMenu")?.contains(ev.target);
    if (!isInside && !isMenuBtn) closeDrawer();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}