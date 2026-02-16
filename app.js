// app.js — FiscoPilot (Premium Reader + DB loader robuste)

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const escapeHtml = (str) =>
  String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json();
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// ---------- Global state ----------
let dbIndex = null;
let modules = [];
let currentModule = null;

let lessons = [];
let qcm = [];
let cases = [];
let currentLessonIdx = 0;

// ---------- UI refs ----------
const modulesList = $("modulesList");
const moduleView = $("moduleView");
const moduleTitle = $("moduleTitle");
const moduleMeta = $("moduleMeta");
const backToModules = $("backToModules");
const errorBox = $("errorBox");

const tabLessons = $("tabLessons");
const tabQcm = $("tabQcm");
const tabCases = $("tabCases");

const panelLessons = $("panelLessons");
const panelQcm = $("panelQcm");
const panelCases = $("panelCases");

const lessonsList = $("lessonsList");
const lessonRandom = $("lessonRandom");
const lessonPrev = $("lessonPrev");
const lessonNext = $("lessonNext");

const qcm5 = $("qcm5");
const qcm10 = $("qcm10");
const qcmBox = $("qcmBox");

const caseRandom = $("caseRandom");
const caseBox = $("caseBox");

// Drawer
const menuBtn = $("menuBtn");
const drawer = $("drawer");
const drawerClose = $("drawerClose");
const drawerBackdrop = $("drawerBackdrop");

// Net badge
const onlineBadge = $("onlineBadge");
const netStatus = $("netStatus");

// Reader
const readerModal = $("readerModal");
const readerClose = $("readerClose");
const readerToc = $("readerToc");
const readerTitle = $("readerTitle");
const readerMeta = $("readerMeta");
const readerBody = $("readerBody");
const readerPrev = $("readerPrev");
const readerNext = $("readerNext");

const tocDrawer = $("tocDrawer");
const tocBackdrop = $("tocBackdrop");
const tocClose = $("tocClose");
const tocList = $("tocList");
const tocSearch = $("tocSearch");

// ---------- Networking badge ----------
function updateOnlineUI() {
  const isOnline = navigator.onLine;
  onlineBadge.textContent = isOnline ? "En ligne" : "Hors ligne";
  onlineBadge.style.borderColor = isOnline ? "rgba(0,255,153,.35)" : "rgba(231,76,60,.35)";
  onlineBadge.style.background = isOnline ? "rgba(0,255,153,.10)" : "rgba(231,76,60,.12)";
  onlineBadge.style.color = isOnline ? "#bfffe8" : "#ffd4d4";
  netStatus.textContent = isOnline ? "Mode PWA • Online" : "Mode PWA • Offline-ready";
}
window.addEventListener("online", updateOnlineUI);
window.addEventListener("offline", updateOnlineUI);

// ---------- Drawer ----------
function openDrawer() {
  drawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
}
function closeDrawer() {
  drawer.classList.add("hidden");
  drawerBackdrop.classList.add("hidden");
}
menuBtn.addEventListener("click", openDrawer);
drawerClose.addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);

// Nav pages (placeholder)
document.querySelectorAll(".navItem").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".navItem").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    closeDrawer();

    const page = btn.dataset.page;
    const map = {
      modules: "pageModules",
      dashboard: "pageDashboard",
      quiz: "pageQuiz",
      exam: "pageExam",
      ai: "pageAI",
      flash: "pageFlash",
      stats: "pageStats",
      settings: "pageSettings",
    };
    Object.values(map).forEach(id => $(id).classList.add("hidden"));
    $(map[page]).classList.remove("hidden");
  });
});

// ---------- Tabs ----------
function setTab(tab) {
  tabLessons.classList.toggle("active", tab === "lessons");
  tabQcm.classList.toggle("active", tab === "qcm");
  tabCases.classList.toggle("active", tab === "cases");

  panelLessons.classList.toggle("hidden", tab !== "lessons");
  panelQcm.classList.toggle("hidden", tab !== "qcm");
  panelCases.classList.toggle("hidden", tab !== "cases");
}
tabLessons.addEventListener("click", () => setTab("lessons"));
tabQcm.addEventListener("click", () => setTab("qcm"));
tabCases.addEventListener("click", () => setTab("cases"));

// ---------- Reader Premium ----------
function openReader(idx) {
  if (!lessons.length) return;
  currentLessonIdx = clamp(idx, 0, lessons.length - 1);
  renderReader();
  readerModal.classList.remove("hidden");
  try { localStorage.setItem("fp_lastLessonIdx", String(currentLessonIdx)); } catch {}
}
function closeReader() {
  readerModal.classList.add("hidden");
  closeToc();
}
function renderReader() {
  const l = lessons[currentLessonIdx];
  const num = currentLessonIdx + 1;
  readerTitle.textContent = l.title || `Cours ${num}`;
  readerMeta.textContent = `${num}/${lessons.length} • ${l.level || "—"}`;

  readerBody.innerHTML = renderLessonRich(l);
  readerBody.scrollTop = 0;

  readerPrev.disabled = currentLessonIdx === 0;
  readerNext.disabled = currentLessonIdx === lessons.length - 1;
}
function renderLessonRich(lesson) {
  const raw = String(lesson.text || "");
  const blocks = raw.split("\n\n").map(s => s.trim()).filter(Boolean);

  const htmlBlocks = blocks.map(b => {
    const upper = b.toUpperCase();
    const isSection =
      upper.startsWith("OBJECTIF:") ||
      upper.startsWith("EXPLICATION:") ||
      upper.startsWith("EXEMPLE:") ||
      upper.startsWith("PIÈGES:") ||
      upper.startsWith("CHECKLIST:") ||
      upper.startsWith("RÉFLEXE:") ||
      upper.startsWith("MINI-TEST:");

    if (isSection) {
      const [head, ...rest] = b.split("\n");
      return `
        <div class="blockTitle">${escapeHtml(head)}</div>
        ${renderParagraphOrList(rest.join("\n").trim())}
      `;
    }
    return renderParagraphOrList(b);
  }).join("");

  return `
    <div class="lessonCard">
      <div class="pill">${escapeHtml(lesson.level || "Niveau")} • TVA Belgique</div>
      <h2>${escapeHtml(lesson.title || "Cours")}</h2>
      ${htmlBlocks}
      <div class="callout">
        <strong>Astuce :</strong> garde une réponse structurée : qualification → règle → application → conclusion.
      </div>
    </div>
  `;
}
function renderParagraphOrList(text) {
  const lines = String(text).split("\n").map(s => s.trim()).filter(Boolean);
  const isList = lines.length >= 2 && lines.every(x => x.startsWith("-") || x.startsWith("•"));
  if (isList) {
    const items = lines.map(x => x.replace(/^[-•]\s*/, "")).map(escapeHtml);
    return `<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
  }
  return `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

// Toc
function openToc() {
  buildToc("");
  tocDrawer.classList.remove("hidden");
  tocBackdrop.classList.remove("hidden");
  tocSearch.value = "";
  setTimeout(() => tocSearch.focus(), 50);
}
function closeToc() {
  tocDrawer.classList.add("hidden");
  tocBackdrop.classList.add("hidden");
}
function buildToc(filter) {
  const f = (filter || "").toLowerCase().trim();
  tocList.innerHTML = "";

  lessons.forEach((l, idx) => {
    const label = `${idx + 1}. ${l.title || ""}`.toLowerCase();
    if (f && !label.includes(f)) return;

    const lv = String(l.level || "");
    const dotColor =
      lv.includes("Début") ? "rgba(46, 204, 113,.9)" :
      lv.includes("Inter") ? "rgba(241, 196, 15,.9)" :
      lv.includes("Avan") ? "rgba(230, 126, 34,.9)" :
      "rgba(231, 76, 60,.9)";

    const el = document.createElement("div");
    el.className = "tocItem";
    el.innerHTML = `
      <div class="tocDot" style="background:${dotColor}"></div>
      <div>
        <strong>${escapeHtml(l.title || "Cours")}</strong>
        <span>${escapeHtml(l.level || "")}</span>
      </div>
    `;
    el.addEventListener("click", () => {
      closeToc();
      openReader(idx);
    });
    tocList.appendChild(el);
  });
}

// Reader events
readerClose.addEventListener("click", closeReader);
readerPrev.addEventListener("click", () => openReader(currentLessonIdx - 1));
readerNext.addEventListener("click", () => openReader(currentLessonIdx + 1));
readerToc.addEventListener("click", openToc);
tocClose.addEventListener("click", closeToc);
tocBackdrop.addEventListener("click", closeToc);
tocSearch.addEventListener("input", (e) => buildToc(e.target.value));

// swipe
let touchX = null;
readerBody.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive:true });
readerBody.addEventListener("touchend", (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) < 60) return;
  if (dx < 0 && currentLessonIdx < lessons.length - 1) openReader(currentLessonIdx + 1);
  if (dx > 0 && currentLessonIdx > 0) openReader(currentLessonIdx - 1);
}, { passive:true });

// ---------- Render module screen ----------
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}
function clearError() {
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}

function renderModules() {
  modulesList.innerHTML = "";
  modules.forEach(m => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="cardTitle">📚 ${escapeHtml(m.title || m.id || "Module")}</div>
      <div class="cardSub">Appuie pour ouvrir</div>
    `;
    div.addEventListener("click", () => openModule(m));
    modulesList.appendChild(div);
  });
}

function renderLessonsList() {
  lessonsList.innerHTML = "";
  lessons.forEach((l, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div style="min-width:0">
        <div class="rowTitle">${escapeHtml(idx + 1)}. ${escapeHtml(l.title || "Cours")}</div>
        <div class="rowMeta">${escapeHtml(l.level || "")}</div>
      </div>
      <div class="openPill">Ouvrir</div>
    `;
    row.addEventListener("click", () => openReader(idx));
    lessonsList.appendChild(row);
  });
}

function renderModuleMeta() {
  const sources = (currentModule?.sources || []).join(", ");
  moduleMeta.textContent = `Cours: ${lessons.length} • QCM: ${qcm.length} • Cas: ${cases.length} • Sources: ${sources}`;
}

function openModule(m) {
  currentModule = m;
  moduleTitle.textContent = m.title || m.id || "Module";
  moduleView.classList.remove("hidden");
  modulesList.classList.add("hidden");

  setTab("lessons");

  loadModuleData(m).catch(err => {
    showError(`Erreur chargement module: ${err.message}`);
  });
}

backToModules.addEventListener("click", () => {
  moduleView.classList.add("hidden");
  modulesList.classList.remove("hidden");
});

// ---------- Load module data (merge sources) ----------
async function loadModuleData(m) {
  clearError();
  lessons = [];
  qcm = [];
  cases = [];

  const srcs = Array.isArray(m.sources) ? m.sources : [];
  if (!srcs.length) throw new Error("Aucune source dans db_index.json");

  const payloads = [];
  for (const path of srcs) {
    // IMPORTANT: chemins relatifs GitHub pages: "./" + path
    const p = path.startsWith("/") ? path.slice(1) : path;
    payloads.push(await fetchJson("./" + p));
  }

  for (const p of payloads) {
    if (Array.isArray(p.lessons)) lessons.push(...p.lessons);
    if (Array.isArray(p.qcm)) qcm.push(...p.qcm);
    if (Array.isArray(p.cases)) cases.push(...p.cases);
  }

  // Clean + stable order
  lessons = lessons.map((l, i) => ({
    id: l.id || `L${i+1}`,
    title: l.title || `Cours ${i+1}`,
    level: l.level || "",
    text: l.text || ""
  }));

  renderLessonsList();
  renderModuleMeta();

  // Hook buttons
  lessonRandom.onclick = () => openReader(Math.floor(Math.random() * lessons.length));
  lessonPrev.onclick = () => openReader(currentLessonIdx - 1);
  lessonNext.onclick = () => openReader(currentLessonIdx + 1);

  qcm5.onclick = () => startQcm(5);
  qcm10.onclick = () => startQcm(10);
  caseRandom.onclick = () => showRandomCase();

  // default first lesson
  currentLessonIdx = 0;

  // QCM + Cases default text
  qcmBox.innerHTML = `<div class="muted">Appuie sur “Lancer” pour démarrer un QCM aléatoire.</div>`;
  caseBox.innerHTML = `<div class="muted">Appuie sur “Cas aléatoire”.</div>`;
}

function startQcm(n) {
  if (!qcm.length) {
    qcmBox.innerHTML = `<div class="muted">Aucune question QCM dans la base.</div>`;
    return;
  }
  const set = shuffle(qcm).slice(0, Math.min(n, qcm.length));
  let i = 0;
  let score = 0;

  const render = () => {
    const q = set[i];
    qcmBox.innerHTML = `
      <div class="muted">${escapeHtml(i+1)}/${escapeHtml(set.length)} • Niveau: ${escapeHtml(q.level || "")}</div>
      <div style="margin-top:10px;font-weight:950">${escapeHtml(q.question || "")}</div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
        ${(q.choices || []).map((c, idx) => `
          <button class="btn ghost" data-idx="${idx}" style="text-align:left">
            ${escapeHtml(c)}
          </button>
        `).join("")}
      </div>
      <div id="qcmExplain" style="margin-top:12px"></div>
    `;

    qcmBox.querySelectorAll("button[data-idx]").forEach(b => {
      b.addEventListener("click", () => {
        const pick = Number(b.dataset.idx);
        const ok = pick === Number(q.answer);
        if (ok) score++;
        const explain = q.explain ? `<div class="callout">${escapeHtml(q.explain)}</div>` : "";
        qcmBox.querySelector("#qcmExplain").innerHTML = `
          <div class="callout">
            ${ok ? "✅ Bonne réponse" : "❌ Mauvaise réponse"} • Score: ${score}/${i+1}
          </div>
          ${explain}
          <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
            <button id="qcmNext" class="btn">${i < set.length-1 ? "Question suivante" : "Voir résultat"}</button>
          </div>
        `;
        const nextBtn = $("qcmNext");
        nextBtn?.addEventListener("click", () => {
          i++;
          if (i >= set.length) {
            qcmBox.innerHTML = `
              <div class="callout"><strong>Résultat :</strong> ${score}/${set.length}</div>
              <div class="muted">Relance un QCM pour t’entraîner.</div>
            `;
          } else render();
        });
      });
    });
  };

  render();
}

function showRandomCase() {
  if (!cases.length) {
    caseBox.innerHTML = `<div class="muted">Aucun cas pratique dans la base.</div>`;
    return;
  }
  const c = cases[Math.floor(Math.random() * cases.length)];
  caseBox.innerHTML = `
    <div class="muted">Niveau: ${escapeHtml(c.level || "")}</div>
    <div style="margin-top:10px;font-weight:950">${escapeHtml(c.title || "Cas")}</div>
    <div style="margin-top:10px">${escapeHtml(c.question || "")}</div>
    <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
      <button id="showAnswer" class="btn ghost">Voir correction</button>
    </div>
    <div id="caseAnswer" style="margin-top:12px"></div>
  `;
  $("showAnswer")?.addEventListener("click", () => {
    const md = c.answer_md ? escapeHtml(c.answer_md).replace(/\n/g, "<br>") : "—";
    $("caseAnswer").innerHTML = `<div class="callout">${md}</div>`;
  });
}

// ---------- Boot: load db_index.json ----------
async function boot() {
  updateOnlineUI();
  clearError();

  // IMPORTANT: tu as db_index.json à la racine (d’après tes screens).
  // On tente d’abord ./db_index.json puis fallback ./db/index.json
  try {
    dbIndex = await fetchJson("./db_index.json");
  } catch (e1) {
    try {
      dbIndex = await fetchJson("./db/index.json");
    } catch (e2) {
      showError("Impossible de charger db_index.json. Vérifie qu’il existe à la racine (db_index.json) ou dans /db/index.json.");
      return;
    }
  }

  modules = Array.isArray(dbIndex.modules) ? dbIndex.modules : [];
  if (!modules.length) {
    showError("db_index.json ne contient aucun module (modules: []).");
    return;
  }

  renderModules();
}

boot().catch(err => showError(err.message));