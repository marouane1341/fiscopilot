/* =========================
   FiscoPilot — app.js (Build 36)
   ========================= */

const APP_BUILD = 36;
document.getElementById("buildNum").textContent = String(APP_BUILD);

// --- Network status pill ---
const netPill = document.getElementById("netPill");
function updateOnlinePill() {
  const on = navigator.onLine;
  netPill.textContent = on ? "En ligne" : "Hors ligne";
  netPill.classList.toggle("online", on);
  netPill.classList.toggle("offline", !on);
}
window.addEventListener("online", updateOnlinePill);
window.addEventListener("offline", updateOnlinePill);
updateOnlinePill();

// --- Drawer ---
const drawer = document.getElementById("drawer");
const btnMenu = document.getElementById("btnMenu");
const btnClose = document.getElementById("btnClose");
btnMenu.onclick = () => openDrawer(true);
btnClose.onclick = () => openDrawer(false);

function openDrawer(open) {
  drawer.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", open ? "false" : "true");
}

// --- Force refresh ---
document.getElementById("navForceRefresh").onclick = async () => {
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "PURGE_CACHES" });
    }
  } catch {}
  // Hard reload
  location.reload(true);
};

// --- Simple router state ---
const app = document.getElementById("app");

let dbIndex = null;
let currentModule = null; // {id,title,sources}
let moduleData = null;    // merged {lessons,qcm,cases}
let activeTab = "lessons"; // lessons|qcm|cases
let filtered = [];        // current list for tab
let modalItems = [];      // list used by modal nav
let modalIndex = 0;

// --- Fetch helpers (cache-bust with build) ---
async function fetchJSON(url) {
  const u = url + (url.includes("?") ? "&" : "?") + "v=" + APP_BUILD;
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return await res.json();
}

// --- Merge sources ---
function mergeModuleSources(all) {
  const out = { lessons: [], qcm: [], cases: [] };

  for (const data of all) {
    if (Array.isArray(data.lessons)) out.lessons.push(...data.lessons.map(x => ({...x})));
    if (Array.isArray(data.qcm)) out.qcm.push(...data.qcm.map(x => ({...x})));
    if (Array.isArray(data.cases)) out.cases.push(...data.cases.map(x => ({...x})));
  }

  // Normalisation
  out.lessons = out.lessons.map((l, idx) => ({
    id: l.id || ("lesson_" + idx),
    title: l.title || "Cours",
    level: l.level || "🟢 Débutant",
    text: l.text || "",
    module: currentModule?.title || ""
  }));

  out.qcm = out.qcm.map((q, idx) => ({
    id: q.id || ("qcm_" + idx),
    level: q.level || "🟢",
    question: q.question || "",
    choices: Array.isArray(q.choices) ? q.choices : [],
    answer: typeof q.answer === "number" ? q.answer : 0,
    explain: q.explain || "",
    module: currentModule?.title || ""
  }));

  out.cases = out.cases.map((c, idx) => ({
    id: c.id || ("case_" + idx),
    title: c.title || "Cas",
    level: c.level || "🟡",
    question: c.question || "",
    answer_md: c.answer_md || "",
    module: currentModule?.title || ""
  }));

  return out;
}

// --- Render: Modules list ---
function renderModules() {
  activeTab = "lessons";
  currentModule = null;
  moduleData = null;

  const modules = dbIndex?.modules || [];

  app.innerHTML = `
    <div class="card">
      <div class="h1">Modules</div>
      <p class="sub">Choisis un module. Chaque module regroupe des <b>cours premium</b> + QCM + cas.</p>
      <div class="list">
        ${modules.map(m => `
          <div class="item">
            <div class="itemTop">
              <div>
                <h3 class="itemTitle">📚 ${escapeHtml(m.title || m.id)}</h3>
                <div class="mini">Sources : ${(m.sources || []).join(", ")}</div>
              </div>
              <button class="openBtn" data-open-module="${escapeAttr(m.id)}">Ouvrir</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  app.querySelectorAll("[data-open-module]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-open-module");
      const mod = modules.find(x => x.id === id);
      if (!mod) return;
      await openModule(mod);
    });
  });
}

// --- Open module (load sources) ---
async function openModule(mod) {
  currentModule = mod;
  openDrawer(false);

  app.innerHTML = `
    <div class="card">
      <div class="moduleRow">
        <div>
          <div class="h1" style="margin:0 0 6px">Modules</div>
          <h2 class="moduleTitle">${escapeHtml(mod.title || mod.id)}</h2>
          <div class="mini">
            Sources: ${(mod.sources || []).join(", ")}
          </div>
        </div>
        <div class="actions">
          <button class="btn ghost" id="btnBack">← Retour</button>
        </div>
      </div>

      <div class="tabs" style="margin-top:16px">
        <button class="tab active" data-tab="lessons">📘 Cours</button>
        <button class="tab" data-tab="qcm">🧪 QCM</button>
        <button class="tab" data-tab="cases">🧾 Cas</button>
      </div>

      <div class="controls">
        <input class="search" id="search" placeholder="Rechercher (ex: prorata, facture, intracom)" />
        <button class="btn primary" id="btnRandom">Aléatoire</button>
      </div>

      <div id="content" class="list"></div>
    </div>
  `;

  document.getElementById("btnBack").onclick = () => renderModules();
  document.getElementById("navModules").onclick = () => renderModules();

  // Load
  try {
    const sources = mod.sources || [];
    const all = [];
    for (const src of sources) {
      const data = await fetchJSON(src);
      all.push(data);
    }
    moduleData = mergeModuleSources(all);
  } catch (e) {
    app.querySelector("#content").innerHTML = `<div class="item">Erreur chargement: ${escapeHtml(String(e.message || e))}</div>`;
    return;
  }

  // Bind tabs
  app.querySelectorAll(".tab").forEach(t => {
    t.onclick = () => {
      app.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      activeTab = t.getAttribute("data-tab");
      applyFilter();
    };
  });

  // Search
  document.getElementById("search").addEventListener("input", applyFilter);
  document.getElementById("btnRandom").onclick = () => openRandom();

  // initial
  applyFilter();
}

// --- Filter + render current tab ---
function applyFilter() {
  const q = (document.getElementById("search")?.value || "").trim().toLowerCase();

  if (!moduleData) return;

  let list = [];
  if (activeTab === "lessons") list = moduleData.lessons;
  if (activeTab === "qcm") list = moduleData.qcm;
  if (activeTab === "cases") list = moduleData.cases;

  if (q) {
    list = list.filter(item => {
      const hay = JSON.stringify(item).toLowerCase();
      return hay.includes(q);
    });
  }

  filtered = list;
  renderTabList();
}

function renderTabList() {
  const content = document.getElementById("content");
  if (!content) return;

  if (!filtered.length) {
    content.innerHTML = `<div class="item">Aucun résultat.</div>`;
    return;
  }

  if (activeTab === "lessons") {
    content.innerHTML = filtered.map((l, i) => `
      <div class="item">
        <div class="itemTop">
          <div>
            <h3 class="itemTitle">${i + 1}. ${escapeHtml(l.title)}</h3>
            <div class="badges">
              ${levelBadge(l.level)}
              <span class="badge">📌 ${escapeHtml(l.module || "")}</span>
              <span class="badge">📍 Cours premium</span>
            </div>
          </div>
          <button class="openBtn" data-open-lesson="${escapeAttr(l.id)}">Ouvrir</button>
        </div>
        <div class="mini" style="margin-top:10px">${escapeHtml(previewText(l.text, 160))}</div>
      </div>
    `).join("");

    content.querySelectorAll("[data-open-lesson]").forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-open-lesson");
        const idx = filtered.findIndex(x => x.id === id);
        openLessonModal(filtered, idx);
      };
    });
    return;
  }

  if (activeTab === "qcm") {
    content.innerHTML = filtered.map((q, i) => `
      <div class="item">
        <div class="itemTop">
          <div>
            <h3 class="itemTitle">${i + 1}. ${escapeHtml(q.question)}</h3>
            <div class="badges">
              ${qcmLevelBadge(q.level)}
              <span class="badge">📌 ${escapeHtml(q.module || "")}</span>
            </div>
          </div>
          <button class="openBtn" data-open-qcm="${escapeAttr(q.id)}">Ouvrir</button>
        </div>
        <div class="mini" style="margin-top:10px">${escapeHtml((q.choices || []).slice(0,2).join(" • "))}${(q.choices||[]).length>2?"…":""}</div>
      </div>
    `).join("");

    content.querySelectorAll("[data-open-qcm]").forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-open-qcm");
        const idx = filtered.findIndex(x => x.id === id);
        openQcmModal(filtered, idx);
      };
    });
    return;
  }

  // cases
  content.innerHTML = filtered.map((c, i) => `
    <div class="item">
      <div class="itemTop">
        <div>
          <h3 class="itemTitle">${i + 1}. ${escapeHtml(c.title)}</h3>
          <div class="badges">
            ${caseLevelBadge(c.level)}
            <span class="badge">📌 ${escapeHtml(c.module || "")}</span>
          </div>
        </div>
        <button class="openBtn" data-open-case="${escapeAttr(c.id)}">Ouvrir</button>
      </div>
      <div class="mini" style="margin-top:10px">${escapeHtml(previewText(c.question, 170))}</div>
    </div>
  `).join("");

  content.querySelectorAll("[data-open-case]").forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-open-case");
      const idx = filtered.findIndex(x => x.id === id);
      openCaseModal(filtered, idx);
    };
  });
}

// --- Random ---
function openRandom() {
  if (!filtered.length) return;
  const idx = Math.floor(Math.random() * filtered.length);

  if (activeTab === "lessons") openLessonModal(filtered, idx);
  if (activeTab === "qcm") openQcmModal(filtered, idx);
  if (activeTab === "cases") openCaseModal(filtered, idx);
}

/* =========================
   MODAL
   ========================= */
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modalBody");
const modalTitle = document.getElementById("modalTitle");
const modalLevel = document.getElementById("modalLevel");
const modalPos = document.getElementById("modalPos");
const modalChips = document.getElementById("modalChips");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

const modalClose = document.getElementById("modalClose");
modalClose.onclick = closeModal;
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

function openModal() {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}
function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  closeToc();
}

prevBtn.onclick = () => navModal(-1);
nextBtn.onclick = () => navModal(1);

function navModal(delta) {
  if (!modalItems.length) return;
  modalIndex = Math.max(0, Math.min(modalItems.length - 1, modalIndex + delta));
  const item = modalItems[modalIndex];

  if (item.__type === "lesson") renderLessonInModal(item);
  if (item.__type === "qcm") renderQcmInModal(item);
  if (item.__type === "case") renderCaseInModal(item);
}

/* TOC */
const toc = document.getElementById("toc");
const tocBody = document.getElementById("tocBody");
document.getElementById("modalMenu").onclick = () => toggleToc();
document.getElementById("tocClose").onclick = () => closeToc();
function toggleToc() {
  const open = toc.classList.toggle("open");
  toc.setAttribute("aria-hidden", open ? "false" : "true");
}
function closeToc() {
  toc.classList.remove("open");
  toc.setAttribute("aria-hidden", "true");
}

/* --- Lessons modal --- */
function openLessonModal(list, idx) {
  modalItems = list.map(x => ({...x, __type:"lesson"}));
  modalIndex = Math.max(0, idx);
  openModal();
  renderLessonInModal(modalItems[modalIndex]);
}

function renderLessonInModal(lesson) {
  modalTitle.textContent = lesson.title;
  modalPos.textContent = `${modalIndex + 1}/${modalItems.length}`;
  modalLevel.textContent = normalizeLevelText(lesson.level);

  modalChips.innerHTML = `
    ${levelBadge(lesson.level)}
    <span class="badge">📌 ${escapeHtml(lesson.module || "")}</span>
    <span class="badge">📍 Cours premium</span>
  `;

  // Sections premium
  const sections = buildPremiumSections(lesson.text || "");
  modalBody.innerHTML = sections.map(sec => sectionHtml(sec)).join("");

  // TOC
  tocBody.innerHTML = sections.map((sec, i) => `
    <button class="tocItem" data-toc="${i}">${escapeHtml(sec.title)}</button>
  `).join("");
  tocBody.querySelectorAll("[data-toc]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.getAttribute("data-toc"));
      const el = modalBody.querySelector(`[data-sec="${i}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      closeToc();
    };
  });
}

/* --- QCM modal --- */
function openQcmModal(list, idx) {
  modalItems = list.map(x => ({...x, __type:"qcm"}));
  modalIndex = Math.max(0, idx);
  openModal();
  renderQcmInModal(modalItems[modalIndex]);
}

function renderQcmInModal(q) {
  modalTitle.textContent = "QCM";
  modalPos.textContent = `${modalIndex + 1}/${modalItems.length}`;
  modalLevel.textContent = "QCM";

  modalChips.innerHTML = `
    ${qcmLevelBadge(q.level)}
    <span class="badge">📌 ${escapeHtml(q.module || "")}</span>
  `;

  const choices = (q.choices || []).map((c, i) => `• ${escapeHtml(c)}`).join("\n");
  modalBody.innerHTML = `
    <div class="section" data-sec="0">
      <div class="sectionTitle">${escapeHtml(q.question)}</div>
      <p class="pText">${choices || "—"}</p>
    </div>
    <div class="section" data-sec="1">
      <div class="sectionTitle">Correction</div>
      <p class="pText">Bonne réponse : <b>${(q.answer ?? 0) + 1}</b></p>
      <p class="pText">${escapeHtml(q.explain || "")}</p>
    </div>
  `;

  tocBody.innerHTML = `
    <button class="tocItem" data-toc="0">Question</button>
    <button class="tocItem" data-toc="1">Correction</button>
  `;
  tocBody.querySelectorAll("[data-toc]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.getAttribute("data-toc"));
      const el = modalBody.querySelector(`[data-sec="${i}"]`);
      if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
      closeToc();
    };
  });
}

/* --- Cases modal --- */
function openCaseModal(list, idx) {
  modalItems = list.map(x => ({...x, __type:"case"}));
  modalIndex = Math.max(0, idx);
  openModal();
  renderCaseInModal(modalItems[modalIndex]);
}

function renderCaseInModal(c) {
  modalTitle.textContent = c.title;
  modalPos.textContent = `${modalIndex + 1}/${modalItems.length}`;
  modalLevel.textContent = "Cas";

  modalChips.innerHTML = `
    ${caseLevelBadge(c.level)}
    <span class="badge">📌 ${escapeHtml(c.module || "")}</span>
  `;

  modalBody.innerHTML = `
    <div class="section" data-sec="0">
      <div class="sectionTitle">Énoncé</div>
      <p class="pText">${escapeHtml(c.question || "")}</p>
    </div>
    <div class="section" data-sec="1">
      <div class="sectionTitle">Réponse (méthode cabinet)</div>
      <p class="pText">${escapeHtml(c.answer_md || "")}</p>
    </div>
  `;

  tocBody.innerHTML = `
    <button class="tocItem" data-toc="0">Énoncé</button>
    <button class="tocItem" data-toc="1">Réponse</button>
  `;
  tocBody.querySelectorAll("[data-toc]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.getAttribute("data-toc"));
      const el = modalBody.querySelector(`[data-sec="${i}"]`);
      if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
      closeToc();
    };
  });
}

/* =========================
   Premium sections parser
   ========================= */
function buildPremiumSections(text) {
  const clean = (text || "").replace(/\r/g, "").trim();
  if (!clean) return [{ title: "Contenu", body: "" }];

  // Si déjà structuré OBJECTIF/EXPLICATION/EXEMPLE/À RETENIR
  const markers = ["OBJECTIF", "EXPLICATION", "EXEMPLE", "À RETENIR", "A RETENIR", "MÉTHODE", "METHODE", "CHECKLIST", "PIÈGES", "PIEGES"];
  const lines = clean.split("\n");

  let sections = [];
  let current = { title: "Contenu", body: "" };

  const push = () => {
    if (current.body.trim()) sections.push(current);
    current = { title: "Contenu", body: "" };
  };

  for (let ln of lines) {
    const t = ln.trim();
    const m = t.match(/^([A-ZÀÉÈÙÂÊÎÔÛÇ ]{4,})\s*:?$/);
    if (m) {
      const head = m[1].trim();
      const isMarker = markers.some(k => head === k);
      if (isMarker) {
        push();
        current = { title: head.replace("A RETENIR", "À RETENIR"), body: "" };
        continue;
      }
    }
    current.body += (current.body ? "\n" : "") + ln;
  }
  push();

  // Si une seule section, on enrichit automatiquement en blocs lisibles
  if (sections.length === 1) {
    sections = [
      { title:"OBJECTIF", body: extractObjective(clean) },
      { title:"EXPLICATION", body: clean },
      { title:"EXEMPLE", body: extractExample(clean) },
      { title:"À RETENIR", body: extractTakeaway(clean) },
    ].filter(s => (s.body || "").trim());
  }

  return sections;
}

function extractObjective(text){
  return "Comprendre la règle, l’appliquer correctement, et savoir la justifier avec une logique « cabinet » : qualification → règle → preuve → conclusion.";
}
function extractExample(text){
  return "Exemple rapide : prends un cas concret, identifie d’abord si l’opération est dans le champ TVA, puis seulement ensuite le taux et les obligations (facture, preuve, listing…).";
}
function extractTakeaway(text){
  return "Réflexe : 1) qualifier 2) vérifier la preuve 3) appliquer la règle 4) conclure + obligations. C’est ce que les contrôles et l’ITAA valorisent.";
}

function sectionHtml(sec, i) {
  const title = (sec.title || "Section").toUpperCase();
  const body = (sec.body || "").trim();

  // Si ça ressemble à du code/checklist, on le met en codeBox
  const looksLikeChecklist = body.split("\n").some(l => /^\s*[-•\d]+\)/.test(l) || /^\s*\d+\)/.test(l));
  const content = looksLikeChecklist
    ? `<div class="codeBox">${escapeHtml(body)}</div>`
    : `<p class="pText">${escapeHtml(body)}</p>`;

  return `
    <div class="section" data-sec="${i}">
      <div class="sectionTitle">${escapeHtml(title)}</div>
      ${content}
    </div>
  `;
}

/* =========================
   Badges helpers
   ========================= */
function levelBadge(level) {
  const l = (level || "").toLowerCase();
  let dot = "ok";
  let label = "Débutant";
  if (l.includes("inter")) { dot="warn"; label="Intermédiaire"; }
  if (l.includes("avanc") || l.includes("expert") || l.includes("🔴")) { dot="bad"; label="Avancé/Expert"; }
  return `<span class="badge"><span class="dot ${dot}"></span>${escapeHtml(label)}</span>`;
}
function qcmLevelBadge(level){
  const s = String(level||"").toLowerCase();
  let dot="ok", label="Débutant";
  if (s.includes("🟠") || s.includes("av")) { dot="warn"; label="Avancé"; }
  if (s.includes("🔴") || s.includes("ex")) { dot="bad"; label="Expert"; }
  return `<span class="badge"><span class="dot ${dot}"></span>${escapeHtml(label)}</span>`;
}
function caseLevelBadge(level){
  const s = String(level||"").toLowerCase();
  let dot="warn", label="Intermédiaire";
  if (s.includes("🟡")) { dot="ok"; label="Débutant"; }
  if (s.includes("🔴")) { dot="bad"; label="Expert"; }
  return `<span class="badge"><span class="dot ${dot}"></span>${escapeHtml(label)}</span>`;
}
function normalizeLevelText(level){
  const l = (level||"").toLowerCase();
  if (l.includes("début") || l.includes("🟢") || l.includes("🟡")) return "Débutant";
  if (l.includes("inter")) return "Intermédiaire";
  if (l.includes("avanc") || l.includes("expert") || l.includes("🔴")) return "Avancé/Expert";
  return "Niveau";
}

/* =========================
   Utils
   ========================= */
function previewText(t, n){
  const s = String(t||"").replace(/\s+/g," ").trim();
  if (s.length <= n) return s;
  return s.slice(0, n-1) + "…";
}
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(str){
  return escapeHtml(str).replaceAll('"',"&quot;");
}

/* =========================
   Boot
   ========================= */
document.getElementById("navModules").onclick = () => renderModules();

(async function boot(){
  // SW register
  try {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("./sw.js?v=" + APP_BUILD);
    }
  } catch {}

  // Load db index
  try {
    dbIndex = await fetchJSON("./db_index.json");
  } catch (e) {
    app.innerHTML = `<div class="card"><div class="h1">Erreur</div><p class="sub">Impossible de charger db_index.json</p><div class="item">${escapeHtml(String(e.message||e))}</div></div>`;
    return;
  }

  renderModules();
})();