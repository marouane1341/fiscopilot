/* app.js — FiscoPilot AI ELITE MAX (stable build)
   - Modules list from /db_index.json
   - Module view with tabs (Cours/QCM/Cas), search + random
   - Premium lesson modal with auto section splitting (OBJECTIF/EXPLICATION/EXEMPLE/À RETENIR)
   - Drawer menu + force refresh (clear SW caches)
   - Offline / online pill
*/

"use strict";

/* =========================
   CONFIG
========================= */
const APP_BUILD = 37; // <-- INCREMENTE à chaque modif (important PWA)
const DB_INDEX_URL = "./db_index.json";
const DEFAULT_MODULE_ID = null; // ex: "tva_be" si tu veux auto-ouvrir

/* =========================
   SAFE DOM HELPERS
========================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function on(el, evt, fn) {
  if (!el) return;
  el.addEventListener(evt, fn, { passive: false });
}
function setText(el, txt) {
  if (!el) return;
  el.textContent = txt;
}
function setHTML(el, html) {
  if (!el) return;
  el.innerHTML = html;
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   STATE
========================= */
const state = {
  modules: [],
  activeModule: null,      // {id,title,sources[]}
  moduleData: null,        // { lessons[], qcm[], cases[] }
  view: "modules",         // modules | module
  tab: "lessons",          // lessons | qcm | cases
  search: "",
  currentList: [],         // current displayed list (lessons/qcm/cases)
  currentIndex: 0,         // index inside currentList when modal open
  tts: {
    enabled: false,
    speaking: false,
    utterance: null
  }
};

/* =========================
   ELEMENTS (from index.html)
========================= */
const els = {
  app: null,
  netPill: null,

  // header + drawer
  btnMenu: null,
  drawer: null,
  btnClose: null,
  navModules: null,
  navForceRefresh: null,

  // modal
  modal: null,
  modalClose: null,
  modalLevel: null,
  modalPos: null,
  modalMenu: null,
  modalBody: null,
  prevBtn: null,
  nextBtn: null
};

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindGlobalEvents();
  updateNetworkPill();
  registerServiceWorker();

  // Boot
  boot().catch((e) => renderFatal(e));
});

function bindElements() {
  els.app = $("#app");
  els.netPill = $("#netPill");

  els.btnMenu = $("#btnMenu");
  els.drawer = $("#drawer");
  els.btnClose = $("#btnClose");
  els.navModules = $("#navModules");
  els.navForceRefresh = $("#navForceRefresh");

  els.modal = $("#modal");
  els.modalClose = $("#modalClose");
  els.modalLevel = $("#modalLevel");
  els.modalPos = $("#modalPos");
  els.modalMenu = $("#modalMenu");
  els.modalBody = $("#modalBody");
  els.prevBtn = $("#prevBtn");
  els.nextBtn = $("#nextBtn");

  // Build number if present
  const buildNum = $("#buildNum");
  if (buildNum) buildNum.textContent = String(APP_BUILD);
}

function bindGlobalEvents() {
  // Drawer open/close
  on(els.btnMenu, "click", () => openDrawer(true));
  on(els.btnClose, "click", () => openDrawer(false));
  on(els.drawer, "click", (e) => {
    // close if click outside body
    if (e.target === els.drawer) openDrawer(false);
  });

  // Drawer actions
  on(els.navModules, "click", () => {
    openDrawer(false);
    goModules();
  });

  on(els.navForceRefresh, "click", async () => {
    openDrawer(false);
    await forceRefreshHard();
  });

  // Modal close
  on(els.modalClose, "click", () => closeModal());
  on(els.modal, "click", (e) => {
    // close if click outside sheet
    const sheet = $(".modalSheet", els.modal);
    if (sheet && !sheet.contains(e.target) && e.target === els.modal) closeModal();
  });

  // Prev/Next
  on(els.prevBtn, "click", () => modalPrev());
  on(els.nextBtn, "click", () => modalNext());

  // Keyboard
  on(document, "keydown", (e) => {
    if (isModalOpen()) {
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowLeft") modalPrev();
      if (e.key === "ArrowRight") modalNext();
    }
  });

  // Network pill
  window.addEventListener("online", updateNetworkPill);
  window.addEventListener("offline", updateNetworkPill);
}

/* =========================
   BOOT + DATA
========================= */
async function boot() {
  renderLoading("Chargement des modules…");
  const idx = await fetchJson(DB_INDEX_URL, { cache: "no-store" });

  state.modules = Array.isArray(idx?.modules) ? idx.modules : [];
  if (!state.modules.length) {
    renderFatal(new Error("db_index.json vide ou invalide."));
    return;
  }

  renderModules();

  // auto open
  if (DEFAULT_MODULE_ID) {
    const m = state.modules.find(x => x.id === DEFAULT_MODULE_ID);
    if (m) openModule(m);
  }
}

async function openModule(module) {
  state.activeModule = module;
  state.moduleData = null;
  state.view = "module";
  state.tab = "lessons";
  state.search = "";

  renderLoading(`Chargement : ${module.title}…`);

  const data = await loadModuleData(module);
  state.moduleData = data;

  renderModuleHome();
}

async function loadModuleData(module) {
  const sources = Array.isArray(module.sources) ? module.sources : [];
  const merged = { lessons: [], qcm: [], cases: [] };

  for (const src of sources) {
    try {
      const json = await fetchJson("./" + src.replace(/^\.\//, ""), { cache: "no-store" });

      // lessons
      const lessons = Array.isArray(json?.lessons) ? json.lessons : [];
      for (const l of lessons) merged.lessons.push(normalizeLesson(l, module));

      // qcm
      const qcm = Array.isArray(json?.qcm) ? json.qcm : [];
      for (const q of qcm) merged.qcm.push(normalizeQcm(q, module));

      // cases
      const cases = Array.isArray(json?.cases) ? json.cases : [];
      for (const c of cases) merged.cases.push(normalizeCase(c, module));
    } catch (e) {
      // Keep going, but show in console
      console.warn("Source load failed:", src, e);
    }
  }

  // stable order by title then id
  merged.lessons.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));
  merged.qcm.sort((a, b) => a.question.localeCompare(b.question));
  merged.cases.sort((a, b) => a.title.localeCompare(b.title));

  return merged;
}

function normalizeLesson(l, module) {
  // Support multiple shapes
  const id = l.id || cryptoRandomId();
  const title = l.title || "Cours";
  const level = l.level || levelFromEmoji(l.level) || "🟢 Débutant";
  const text = l.text || l.content || l.body || "";
  return {
    kind: "lesson",
    id,
    title,
    level,
    moduleTitle: module?.title || "",
    premium: true,
    // If user already provides structured fields, keep them:
    objective: l.objective || "",
    explanation: l.explanation || "",
    example: l.example || "",
    retenir: l.retenir || "",
    // else fallback to raw text
    text,
    order: extractLeadingNumber(title) ?? 999999
  };
}

function normalizeQcm(q, module) {
  return {
    kind: "qcm",
    level: q.level || "🟢",
    question: q.question || "",
    choices: Array.isArray(q.choices) ? q.choices : [],
    answer: Number.isFinite(q.answer) ? q.answer : 0,
    explain: q.explain || "",
    moduleTitle: module?.title || ""
  };
}

function normalizeCase(c, module) {
  return {
    kind: "case",
    title: c.title || "Cas",
    level: c.level || "🟢",
    question: c.question || "",
    answer_md: c.answer_md || "",
    moduleTitle: module?.title || ""
  };
}

function levelFromEmoji(v) {
  // accept "🔴 Expert" etc
  if (typeof v !== "string") return "";
  return v;
}
function extractLeadingNumber(title) {
  const m = String(title).match(/^(\d+)\./);
  return m ? parseInt(m[1], 10) : null;
}
function cryptoRandomId() {
  return "id_" + Math.random().toString(36).slice(2, 10);
}

/* =========================
   RENDER: COMMON
========================= */
function renderLoading(msg) {
  setHTML(els.app, `
    <div class="card">
      <div class="h1">Chargement</div>
      <div class="muted">${escapeHtml(msg)}</div>
    </div>
  `);
}

function renderFatal(err) {
  console.error(err);
  setHTML(els.app, `
    <div class="card">
      <div class="h1">Erreur</div>
      <div class="muted">${escapeHtml(err?.message || String(err))}</div>
      <div style="height:12px"></div>
      <button class="btn primary" id="btnReload">Recharger</button>
    </div>
  `);
  on($("#btnReload"), "click", () => location.reload());
}

/* =========================
   RENDER: MODULES LIST
========================= */
function goModules() {
  state.view = "modules";
  state.activeModule = null;
  state.moduleData = null;
  renderModules();
}

function renderModules() {
  const cards = state.modules.map(m => {
    const src = (m.sources || []).join(", ");
    return `
      <div class="card">
        <div class="row between">
          <div>
            <div class="h2">📚 ${escapeHtml(m.title || m.id)}</div>
            <div class="muted">Sources: ${escapeHtml(src)}</div>
          </div>
          <button class="btn primary" data-open="${escapeHtml(m.id)}">Ouvrir</button>
        </div>
      </div>
    `;
  }).join("");

  setHTML(els.app, `
    <div class="card">
      <div class="h1">Modules</div>
      <div class="muted">Choisis un module. Les cours premium ont un objectif, une explication claire, des exemples et “à retenir”.</div>
    </div>
    ${cards}
  `);

  $$("[data-open]").forEach(btn => {
    on(btn, "click", () => {
      const id = btn.getAttribute("data-open");
      const m = state.modules.find(x => x.id === id);
      if (m) openModule(m);
    });
  });
}

/* =========================
   RENDER: MODULE HOME + TABS
========================= */
function renderModuleHome() {
  const m = state.activeModule;
  const d = state.moduleData;

  if (!m || !d) return renderFatal(new Error("Module introuvable"));

  const counts = {
    lessons: d.lessons.length,
    qcm: d.qcm.length,
    cases: d.cases.length
  };

  const src = (m.sources || []).join(", ");

  setHTML(els.app, `
    <div class="card">
      <div class="h1">📘 ${escapeHtml(m.title)}</div>
      <div class="muted">Cours: ${counts.lessons} • QCM: ${counts.qcm} • Cas: ${counts.cases}</div>
      <div class="muted">Sources: ${escapeHtml(src)}</div>

      <div style="height:14px"></div>

      <div class="tabs">
        <button class="tab ${state.tab === "lessons" ? "active" : ""}" data-tab="lessons">📘 Cours</button>
        <button class="tab ${state.tab === "qcm" ? "active" : ""}" data-tab="qcm">🧪 QCM</button>
        <button class="tab ${state.tab === "cases" ? "active" : ""}" data-tab="cases">🧾 Cas</button>
      </div>

      <div style="height:12px"></div>

      <div class="row gap">
        <input class="input" id="searchInput" placeholder="Rechercher (ex: prorata, facture, intracom)" value="${escapeHtml(state.search)}" />
        <button class="btn primary" id="btnRandom">Aléatoire</button>
      </div>
    </div>

    <div id="listZone"></div>
  `);

  // events
  $$("[data-tab]").forEach(b => {
    on(b, "click", () => {
      state.tab = b.getAttribute("data-tab");
      state.search = String($("#searchInput")?.value || "");
      renderModuleHome();
    });
  });

  on($("#searchInput"), "input", (e) => {
    state.search = e.target.value || "";
    renderTabList();
  });

  on($("#btnRandom"), "click", () => openRandom());

  renderTabList();
}

function renderTabList() {
  const zone = $("#listZone");
  if (!zone) return;

  const d = state.moduleData;
  if (!d) return;

  let list = [];
  if (state.tab === "lessons") list = d.lessons;
  if (state.tab === "qcm") list = d.qcm;
  if (state.tab === "cases") list = d.cases;

  const q = (state.search || "").trim().toLowerCase();
  if (q) {
    list = list.filter(item => {
      const hay = JSON.stringify(item).toLowerCase();
      return hay.includes(q);
    });
  }

  state.currentList = list;

  if (!list.length) {
    setHTML(zone, `<div class="card"><div class="muted">Aucun résultat.</div></div>`);
    return;
  }

  if (state.tab === "lessons") {
    setHTML(zone, list.map((l, idx) => lessonCard(l, idx)).join(""));
    $$("[data-open-lesson]").forEach(btn => {
      on(btn, "click", () => {
        const i = parseInt(btn.getAttribute("data-open-lesson"), 10);
        openLesson(i);
      });
    });
    return;
  }

  if (state.tab === "qcm") {
    setHTML(zone, list.map((qcm, idx) => qcmCard(qcm, idx)).join(""));
    $$("[data-open-qcm]").forEach(btn => {
      on(btn, "click", () => {
        const i = parseInt(btn.getAttribute("data-open-qcm"), 10);
        openQcm(i);
      });
    });
    return;
  }

  if (state.tab === "cases") {
    setHTML(zone, list.map((c, idx) => caseCard(c, idx)).join(""));
    $$("[data-open-case]").forEach(btn => {
      on(btn, "click", () => {
        const i = parseInt(btn.getAttribute("data-open-case"), 10);
        openCase(i);
      });
    });
    return;
  }
}

function lessonCard(l, idx) {
  const preview = buildPreviewText(l, 240);
  return `
    <div class="card lessonCard">
      <div class="row between">
        <div>
          <div class="h2">${escapeHtml(l.title)}</div>
          <div class="pills">
            <span class="pill">${escapeHtml(l.level || "Débutant")}</span>
            <span class="pill">📌 ${escapeHtml(l.moduleTitle || "")}</span>
            <span class="pill">📍 Cours premium</span>
          </div>
        </div>
        <button class="btn ghost" data-open-lesson="${idx}">Ouvrir</button>
      </div>
      <div class="muted" style="margin-top:10px">${escapeHtml(preview)}</div>
    </div>
  `;
}

function qcmCard(q, idx) {
  const short = (q.question || "").slice(0, 180);
  return `
    <div class="card">
      <div class="row between">
        <div>
          <div class="h2">${escapeHtml(short)}${q.question?.length > 180 ? "…" : ""}</div>
          <div class="pills">
            <span class="pill">${escapeHtml(q.level || "🟢")}</span>
            <span class="pill">📌 ${escapeHtml(q.moduleTitle || "")}</span>
          </div>
        </div>
        <button class="btn ghost" data-open-qcm="${idx}">Ouvrir</button>
      </div>
    </div>
  `;
}

function caseCard(c, idx) {
  const short = (c.question || "").slice(0, 180);
  return `
    <div class="card">
      <div class="row between">
        <div>
          <div class="h2">${escapeHtml(c.title)}</div>
          <div class="pills">
            <span class="pill">${escapeHtml(c.level || "🟢")}</span>
            <span class="pill">📌 ${escapeHtml(c.moduleTitle || "")}</span>
          </div>
          <div class="muted" style="margin-top:10px">${escapeHtml(short)}${c.question?.length > 180 ? "…" : ""}</div>
        </div>
        <button class="btn ghost" data-open-case="${idx}">Ouvrir</button>
      </div>
    </div>
  `;
}

function buildPreviewText(lesson, maxLen) {
  const blocks = lessonToPremiumBlocks(lesson);
  const joined = blocks.map(b => `${b.title}: ${b.body}`).join("  ");
  const s = joined.replace(/\s+/g, " ").trim();
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

/* =========================
   RANDOM OPEN
========================= */
function openRandom() {
  if (!state.currentList?.length) return;
  const idx = Math.floor(Math.random() * state.currentList.length);
  if (state.tab === "lessons") openLesson(idx);
  if (state.tab === "qcm") openQcm(idx);
  if (state.tab === "cases") openCase(idx);
}

/* =========================
   MODAL: LESSON/QCM/CASE
========================= */
function isModalOpen() {
  return els.modal && els.modal.getAttribute("aria-hidden") === "false";
}

function openModal() {
  if (!els.modal) return;
  els.modal.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("modalOpen");
}

function closeModal() {
  stopTts();
  if (!els.modal) return;
  els.modal.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("modalOpen");
}

function openLesson(idx) {
  state.currentIndex = clampIndex(idx);
  const l = state.currentList[state.currentIndex];
  if (!l) return;

  const total = state.currentList.length;
  setText(els.modalLevel, normalizeLevelLabel(l.level));
  setText(els.modalPos, `${state.currentIndex + 1}/${total}`);

  // Build modal body with premium blocks
  const blocks = lessonToPremiumBlocks(l);

  const header = `
    <div class="modalTitle">${escapeHtml(l.title)}</div>
    <div class="pills" style="margin-top:10px">
      <span class="pill">${escapeHtml(normalizeLevelLabel(l.level))}</span>
      <span class="pill">📌 ${escapeHtml(l.moduleTitle || "")}</span>
      <span class="pill">📍 Cours premium</span>
    </div>
  `;

  const body = blocks.map(b => {
    const monoClass = b.mono ? " mono" : "";
    return `
      <div class="block">
        <div class="blockTitle">${escapeHtml(b.title)}</div>
        <div class="blockBody${monoClass}">${formatBlockBody(b.body, b.mono)}</div>
      </div>
    `;
  }).join("");

  setHTML(els.modalBody, header + body);

  // Modal menu: TTS
  setupModalMenuForLesson(l);

  // Buttons
  setText(els.prevBtn, "◀ Précédent");
  setText(els.nextBtn, "Suivant ▶");
  openModal();
}

function openQcm(idx) {
  state.currentIndex = clampIndex(idx);
  const q = state.currentList[state.currentIndex];
  if (!q) return;

  const total = state.currentList.length;
  setText(els.modalLevel, q.level || "🟢");
  setText(els.modalPos, `${state.currentIndex + 1}/${total}`);

  const choices = (q.choices || []).map((c, i) => {
    return `<button class="choice" data-choice="${i}">${escapeHtml(String(i + 1) + ". " + c)}</button>`;
  }).join("");

  setHTML(els.modalBody, `
    <div class="modalTitle">QCM</div>
    <div class="pills" style="margin-top:10px">
      <span class="pill">${escapeHtml(q.level || "🟢")}</span>
      <span class="pill">📌 ${escapeHtml(q.moduleTitle || "")}</span>
    </div>

    <div class="block" style="margin-top:14px">
      <div class="blockTitle">QUESTION</div>
      <div class="blockBody">${escapeHtml(q.question || "")}</div>
    </div>

    <div class="block">
      <div class="blockTitle">CHOIX</div>
      <div class="choices">${choices}</div>
      <div id="qcmResult" class="muted" style="margin-top:12px"></div>
    </div>
  `);

  // menu off
  setupModalMenuEmpty();

  $$("[data-choice]", els.modalBody).forEach(btn => {
    on(btn, "click", () => {
      const chosen = parseInt(btn.getAttribute("data-choice"), 10);
      const ok = chosen === q.answer;
      const res = $("#qcmResult", els.modalBody);
      if (res) {
        res.innerHTML = ok
          ? `✅ Bonne réponse. <div style="margin-top:8px">${escapeHtml(q.explain || "")}</div>`
          : `❌ Mauvais choix. Bonne réponse: ${escapeHtml(String(q.answer + 1))}<div style="margin-top:8px">${escapeHtml(q.explain || "")}</div>`;
      }
      // lock buttons
      $$("[data-choice]", els.modalBody).forEach(b => b.disabled = true);
    });
  });

  setText(els.prevBtn, "◀ Précédent");
  setText(els.nextBtn, "Suivant ▶");
  openModal();
}

function openCase(idx) {
  state.currentIndex = clampIndex(idx);
  const c = state.currentList[state.currentIndex];
  if (!c) return;

  const total = state.currentList.length;
  setText(els.modalLevel, c.level || "🟢");
  setText(els.modalPos, `${state.currentIndex + 1}/${total}`);

  setHTML(els.modalBody, `
    <div class="modalTitle">${escapeHtml(c.title)}</div>
    <div class="pills" style="margin-top:10px">
      <span class="pill">${escapeHtml(c.level || "🟢")}</span>
      <span class="pill">📌 ${escapeHtml(c.moduleTitle || "")}</span>
    </div>

    <div class="block" style="margin-top:14px">
      <div class="blockTitle">ÉNONCÉ</div>
      <div class="blockBody">${escapeHtml(c.question || "")}</div>
    </div>

    <div class="block">
      <div class="blockTitle">CORRIGÉ</div>
      <div class="blockBody mono">${formatBlockBody(c.answer_md || "", true)}</div>
    </div>
  `);

  setupModalMenuEmpty();

  setText(els.prevBtn, "◀ Précédent");
  setText(els.nextBtn, "Suivant ▶");
  openModal();
}

function modalPrev() {
  if (!state.currentList?.length) return;
  stopTts();
  const idx = state.currentIndex - 1;
  if (idx < 0) return;
  if (state.tab === "lessons") openLesson(idx);
  if (state.tab === "qcm") openQcm(idx);
  if (state.tab === "cases") openCase(idx);
}

function modalNext() {
  if (!state.currentList?.length) return;
  stopTts();
  const idx = state.currentIndex + 1;
  if (idx >= state.currentList.length) return;
  if (state.tab === "lessons") openLesson(idx);
  if (state.tab === "qcm") openQcm(idx);
  if (state.tab === "cases") openCase(idx);
}

function clampIndex(i) {
  const n = state.currentList?.length || 0;
  if (!n) return 0;
  if (i < 0) return 0;
  if (i >= n) return n - 1;
  return i;
}

function normalizeLevelLabel(level) {
  const s = String(level || "").trim();
  if (!s) return "Débutant";
  return s;
}

function formatBlockBody(text, mono) {
  const t = String(text || "").trim();
  if (!t) return "";
  if (mono) {
    // preserve new lines
    return `<pre class="pre">${escapeHtml(t)}</pre>`;
  }
  // normal paragraph with line breaks
  return escapeHtml(t).replace(/\n/g, "<br/>");
}

/* =========================
   PREMIUM BLOCKS (AUTO SPLIT)
========================= */
function lessonToPremiumBlocks(lesson) {
  // 1) If already structured
  const blocks = [];
  if (lesson.objective) blocks.push({ title: "OBJECTIF", body: lesson.objective });
  if (lesson.explanation) blocks.push({ title: "EXPLICATION", body: lesson.explanation });
  if (lesson.example) blocks.push({ title: "EXEMPLE", body: lesson.example, mono: true });
  if (lesson.retenir) blocks.push({ title: "À RETENIR", body: lesson.retenir });

  if (blocks.length) return blocks;

  // 2) else parse raw
  const raw = (lesson.text || lesson.content || lesson.body || "").trim();
  if (!raw) return [{ title: "CONTENU", body: "" }];

  const txt = raw
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

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

  const lines = txt.split("\n");
  let currentTitle = null;
  let buffer = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (!body) { buffer = []; return; }
    const t = currentTitle || "CONTENU";
    blocks.push({
      title: t,
      body,
      mono: t === "EXEMPLE" || t === "CORRIGÉ" || t === "CORRIGE"
    });
    buffer = [];
  };

  for (const line of lines) {
    const l = line.trim();
    const up = l.toUpperCase();
    const isHeading = headings.some(h => up === h || up === (h + ":"));
    if (isHeading) {
      flush();
      currentTitle = up.replace(/:$/, "");
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (!blocks.length) return [{ title: "CONTENU", body: txt }];
  return blocks;
}

/* =========================
   MODAL MENU + TTS
========================= */
function setupModalMenuEmpty() {
  // keep menu button but no actions
  if (!els.modalMenu) return;
  els.modalMenu.setAttribute("data-mode", "empty");
  els.modalMenu.onclick = null;
  els.modalMenu.title = "Menu";
  on(els.modalMenu, "click", () => {
    // no-op for now
    toast("Menu indisponible pour ce type.");
  });
}

function setupModalMenuForLesson(lesson) {
  if (!els.modalMenu) return;

  // Enable TTS if available
  const canTts = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  els.modalMenu.setAttribute("data-mode", "lesson");
  els.modalMenu.onclick = null;
  els.modalMenu.title = canTts ? "Menu (audio)" : "Menu";

  on(els.modalMenu, "click", () => {
    if (!canTts) {
      toast("Audio non supporté sur ce navigateur.");
      return;
    }
    // Toggle speak/stop
    if (state.tts.speaking) {
      stopTts();
      toast("Audio arrêté.");
    } else {
      const blocks = lessonToPremiumBlocks(lesson);
      const text = blocks.map(b => `${b.title}. ${stripForSpeech(b.body)}`).join("\n\n");
      startTts(text);
    }
  });
}

function stripForSpeech(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/•/g, "")
    .trim();
}

function startTts(text) {
  stopTts();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "fr-FR";
  utter.rate = 1.0;
  utter.pitch = 1.0;

  utter.onend = () => {
    state.tts.speaking = false;
    state.tts.utterance = null;
  };
  utter.onerror = () => {
    state.tts.speaking = false;
    state.tts.utterance = null;
    toast("Erreur audio.");
  };

  state.tts.utterance = utter;
  state.tts.speaking = true;
  window.speechSynthesis.speak(utter);

  toast("Lecture audio… (appuie sur ☰ pour arrêter)");
}

function stopTts() {
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch {}
  state.tts.speaking = false;
  state.tts.utterance = null;
}

/* =========================
   DRAWER
========================= */
function openDrawer(open) {
  if (!els.drawer) return;
  els.drawer.setAttribute("aria-hidden", open ? "false" : "true");
}

/* =========================
   FORCE REFRESH (clear caches + reload)
========================= */
async function forceRefreshHard() {
  try {
    // Unregister SW
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }

    // Clear caches
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {
    console.warn("forceRefresh error:", e);
  } finally {
    location.reload();
  }
}

/* =========================
   NETWORK PILL
========================= */
function updateNetworkPill() {
  const online = navigator.onLine;
  if (!els.netPill) return;
  els.netPill.classList.toggle("online", online);
  els.netPill.classList.toggle("offline", !online);
  els.netPill.textContent = online ? "En ligne" : "Hors ligne";
}

/* =========================
   SERVICE WORKER
========================= */
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (e) {
    console.warn("SW register failed:", e);
  }
}

/* =========================
   FETCH JSON (stable)
========================= */
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    method: "GET",
    cache: opts.cache || "no-store",
    headers: { "Accept": "application/json" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return await res.json();
}

/* =========================
   TOAST (simple)
========================= */
let toastTimer = null;
function toast(msg) {
  // Create once
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "18px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 14px";
    el.style.borderRadius = "14px";
    el.style.background = "rgba(0,0,0,0.55)";
    el.style.color = "white";
    el.style.fontSize = "14px";
    el.style.backdropFilter = "blur(10px)";
    el.style.zIndex = "999999";
    el.style.maxWidth = "90vw";
    el.style.textAlign = "center";
    el.style.opacity = "0";
    el.style.transition = "opacity .18s ease";
    document.body.appendChild(el);
  }
  el.textContent = msg;

  clearTimeout(toastTimer);
  el.style.opacity = "1";
  toastTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, 1800);
}