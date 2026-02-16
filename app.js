/* app.js — FiscoPilot (premium A) */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** ---------- Drawer / Routing ---------- **/
const drawer = $("#drawer");
const overlay = $("#overlay");
const btnMenu = $("#btnMenu");

function openDrawer() {
  drawer.classList.add("open");
  overlay.classList.add("show");
}
function closeDrawer() {
  drawer.classList.remove("open");
  overlay.classList.remove("show");
}

btnMenu.addEventListener("click", () => {
  if (drawer.classList.contains("open")) closeDrawer();
  else openDrawer();
});
overlay.addEventListener("click", closeDrawer);

$$(".drawer a").forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const route = a.getAttribute("data-route");
    navigate(route);
    closeDrawer();
  });
});

function navigate(route) {
  const pages = [
    "dashboard","modules","quiz","examen","prof","flashcards","stats","settings"
  ];
  pages.forEach(p => $("#page-" + p)?.classList.remove("active"));
  $("#page-" + route)?.classList.add("active");
  location.hash = route;

  // auto-load modules when going to modules
  if (route === "modules") loadIndexAndRenderModules();
}

window.addEventListener("hashchange", () => {
  const route = (location.hash || "#dashboard").replace("#", "");
  navigate(route);
});

/** ---------- Network pill ---------- **/
const netPill = $("#netPill");
function updateNetPill() {
  const online = navigator.onLine;
  netPill.textContent = online ? "En ligne" : "Hors ligne";
  netPill.style.borderColor = online ? "rgba(34,197,94,.55)" : "rgba(239,68,68,.55)";
  netPill.style.background = online ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)";
}
window.addEventListener("online", updateNetPill);
window.addEventListener("offline", updateNetPill);
updateNetPill();

/** ---------- Data loading ---------- **/
const modulesListEl = $("#modulesList");
const moduleViewEl = $("#moduleView");
const moduleTitleEl = $("#moduleTitle");
const moduleMetaEl = $("#moduleMeta");
const loadErrorEl = $("#loadError");

const lessonListEl = $("#lessonList");
const lessonTitleEl = $("#lessonTitle");
const lessonLevelEl = $("#lessonLevel");
const lessonTextEl = $("#lessonText");

const qcmBoxEl = $("#qcmBox");
const caseBoxEl = $("#caseBox");

$("#btnBackModules").addEventListener("click", () => {
  moduleViewEl.classList.add("hidden");
  modulesListEl.classList.remove("hidden");
});

const tabs = $$(".tab");
tabs.forEach(t => {
  t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.getAttribute("data-tab");
    ["cours","qcm","cas"].forEach(name => {
      $("#tab-" + name).classList.toggle("hidden", name !== tab);
    });
  });
});

let indexData = null;
let currentModule = null;
let lessons = [];
let qcms = [];
let cases = [];
let currentLessonIdx = 0;

// IMPORTANT : fetch relatif (GitHub Pages /fiscopilot/)
async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function loadIndexAndRenderModules() {
  loadErrorEl.classList.add("hidden");
  loadErrorEl.textContent = "";

  try {
    if (!indexData) {
      indexData = await fetchJson("./db_index.json");
    }
    renderModules(indexData.modules || []);
  } catch (err) {
    console.error(err);
    showError("Erreur chargement index: " + err.message + "\n\nVérifie que db_index.json existe bien à la racine du repo.");
  }
}

function renderModules(mods) {
  modulesListEl.innerHTML = "";
  moduleViewEl.classList.add("hidden");
  modulesListEl.classList.remove("hidden");

  if (!mods.length) {
    modulesListEl.innerHTML = `<div class="errorbox">Aucun module trouvé dans db_index.json</div>`;
    return;
  }

  mods.forEach(m => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="cardTitle">📚 ${escapeHtml(m.title || m.id || "Module")}</div>
      <div class="cardSub">Appuie pour ouvrir</div>
    `;
    card.addEventListener("click", () => openModule(m));
    modulesListEl.appendChild(card);
  });
}

async function openModule(mod) {
  currentModule = mod;
  modulesListEl.classList.add("hidden");
  moduleViewEl.classList.remove("hidden");

  moduleTitleEl.textContent = mod.title || mod.id || "Module";
  moduleMetaEl.textContent = "Chargement…";
  lessonListEl.innerHTML = "";
  lessonTitleEl.textContent = "Chargement…";
  lessonLevelEl.textContent = "—";
  lessonTextEl.textContent = "";
  qcmBoxEl.innerHTML = `<div class="muted">Chargement…</div>`;
  caseBoxEl.innerHTML = `<div class="muted">Chargement…</div>`;

  try {
    const sources = (mod.sources || []).map(s => normalizePath(s));
    // charge et merge
    const parts = await Promise.all(sources.map(s => fetchJson("./" + s)));
    lessons = [];
    qcms = [];
    cases = [];

    parts.forEach(p => {
      if (Array.isArray(p.lessons)) lessons.push(...p.lessons);
      if (Array.isArray(p.qcm)) qcms.push(...p.qcm);
      if (Array.isArray(p.cases)) cases.push(...p.cases);
    });

    // fallback si db/tva.json est structuré différemment
    lessons = lessons.filter(x => x && x.title && x.text);
    qcms = qcms.filter(x => x && x.question && Array.isArray(x.choices));
    cases = cases.filter(x => x && x.title && x.question);

    moduleMetaEl.textContent =
      `Cours: ${lessons.length} • QCM: ${qcms.length} • Cas: ${cases.length} • Sources: ${sources.join(", ")}`;

    renderLessons();
    renderQcmHome();
    renderCaseHome();

    // reset to cours tab
    $(".tab[data-tab='cours']").click();
  } catch (err) {
    console.error(err);
    showError("Erreur chargement module: " + err.message + "\n\n→ Vérifie que tous les fichiers .json existent dans /db/ et que leurs noms correspondent EXACTEMENT.");
    moduleMetaEl.textContent = "Erreur de chargement";
  }
}

function normalizePath(p) {
  // évite les paths qui commencent par "/"
  if (!p) return p;
  return p.startsWith("/") ? p.slice(1) : p;
}

/** ---------- Lessons ---------- **/
function renderLessons() {
  lessonListEl.innerHTML = "";

  if (!lessons.length) {
    lessonListEl.innerHTML = `<div class="muted">Aucun cours trouvé dans ces JSON.</div>`;
    lessonTitleEl.textContent = "Aucun cours";
    lessonTextEl.textContent = "";
    return;
  }

  lessons.forEach((l, idx) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <div class="itemTitle">${idx + 1}. ${escapeHtml(l.title)}</div>
        <div class="muted" style="font-size:12px;margin-top:2px;">${escapeHtml(l.level || "")}</div>
      </div>
      <div class="badge">Ouvrir</div>
    `;
    row.addEventListener("click", () => openLesson(idx));
    lessonListEl.appendChild(row);
  });

  openLesson(0);
}

function openLesson(idx) {
  if (!lessons.length) return;
  currentLessonIdx = clamp(idx, 0, lessons.length - 1);
  const l = lessons[currentLessonIdx];
  lessonTitleEl.textContent = `${currentLessonIdx + 1}/${lessons.length} • ${l.title}`;
  lessonLevelEl.textContent = l.level || "—";
  lessonTextEl.textContent = l.text || "";
}

$("#btnLessonPrev").addEventListener("click", () => openLesson(currentLessonIdx - 1));
$("#btnLessonNext").addEventListener("click", () => openLesson(currentLessonIdx + 1));
$("#btnLessonRandom").addEventListener("click", () => {
  if (!lessons.length) return;
  const idx = Math.floor(Math.random() * lessons.length);
  openLesson(idx);
});

/** ---------- QCM ---------- **/
function renderQcmHome() {
  if (!qcms.length) {
    qcmBoxEl.innerHTML = `<div class="muted">Aucun QCM trouvé dans ces JSON.</div>`;
    return;
  }
  qcmBoxEl.innerHTML = `<div class="muted">Prêt. Lance un QCM aléatoire.</div>`;
}

$("#btnQcm5").addEventListener("click", () => startQcm(5));
$("#btnQcm10").addEventListener("click", () => startQcm(10));

function startQcm(n) {
  if (!qcms.length) return;
  const picks = shuffle([...qcms]).slice(0, Math.min(n, qcms.length));
  let i = 0;
  let score = 0;

  const render = () => {
    const q = picks[i];
    qcmBoxEl.innerHTML = `
      <div class="badge" style="margin-bottom:10px;">${i + 1}/${picks.length} • Niveau ${escapeHtml(q.level || "")}</div>
      <div class="qcmQuestion">${escapeHtml(q.question)}</div>
      <div id="choices"></div>
      <hr class="sep">
      <div class="muted">Score: <b>${score}</b> / ${i}</div>
    `;

    const choicesEl = $("#choices");
    q.choices.forEach((c, idx) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = c;

      b.addEventListener("click", () => {
        const correct = (idx === q.answer);
        if (correct) score += 1;

        // lock
        Array.from(choicesEl.querySelectorAll("button")).forEach((btn, bi) => {
          btn.disabled = true;
          if (bi === q.answer) btn.classList.add("correct");
        });
        if (!correct) b.classList.add("wrong");

        const exp = document.createElement("div");
        exp.className = "muted";
        exp.style.marginTop = "10px";
        exp.textContent = q.explain ? ("Explication : " + q.explain) : "";
        qcmBoxEl.appendChild(exp);

        const nextBtn = document.createElement("button");
        nextBtn.className = "btn";
        nextBtn.style.marginTop = "12px";
        nextBtn.textContent = (i === picks.length - 1) ? "Voir résultat" : "Question suivante";
        nextBtn.addEventListener("click", () => {
          i += 1;
          if (i >= picks.length) {
            qcmBoxEl.innerHTML = `
              <div class="panel">
                <div class="panel-title">Résultat</div>
                <div class="panel-body">Score final : <b>${score}</b> / ${picks.length}</div>
              </div>
            `;
          } else {
            render();
          }
        });
        qcmBoxEl.appendChild(nextBtn);
      });

      choicesEl.appendChild(b);
    });
  };

  render();
}

/** ---------- Cases ---------- **/
function renderCaseHome() {
  if (!cases.length) {
    caseBoxEl.innerHTML = `<div class="muted">Aucun cas trouvé dans ces JSON.</div>`;
    return;
  }
  caseBoxEl.innerHTML = `<div class="muted">Prêt. Lance un cas aléatoire.</div>`;
}

$("#btnCaseRandom").addEventListener("click", () => {
  if (!cases.length) return;
  const c = cases[Math.floor(Math.random() * cases.length)];
  caseBoxEl.innerHTML = `
    <div class="badge" style="margin-bottom:10px;">Niveau ${escapeHtml(c.level || "")}</div>
    <div class="qcmQuestion">${escapeHtml(c.title)}</div>
    <div class="muted" style="margin-top:8px;">${escapeHtml(c.question)}</div>
    <div style="margin-top:12px;">
      <button class="btn ghost" id="btnShowAnswer">Voir correction</button>
    </div>
    <div id="caseAnswer" class="readerBody" style="display:none;margin-top:12px;"></div>
  `;
  $("#btnShowAnswer").addEventListener("click", () => {
    const ans = $("#caseAnswer");
    ans.style.display = "block";
    ans.textContent = (c.answer_md || c.answer || "—");
  });
});

/** ---------- Helpers ---------- **/
function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(msg){
  loadErrorEl.textContent = msg;
  loadErrorEl.classList.remove("hidden");
}

/** ---------- Boot ---------- **/
(function boot(){
  const route = (location.hash || "#dashboard").replace("#", "");
  navigate(route);
})();