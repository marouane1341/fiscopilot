/* app.js — FiscoPilot (Premium Reader V2)
   - Lessons with sections + internal clickable outline
   - Works with legacy lessons: { text }
*/

const APP_BUILD = 32; // incrémente quand tu changes le code OU les JSON
const DB_INDEX_URL = "db_index.json";

const state = {
  modules: [],
  activeModule: null,
  dataByModuleId: {}, // { id: { lessons:[], qcm:[], cases:[], sources:[] } }
  view: "modules", // modules | module
  tab: "lessons", // lessons | qcm | cases
  lessonIndex: 0,
  search: ""
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => (s ?? "").toString()
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function el(tag, attrs = {}, html = "") {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === "class") node.className = v;
    else if (k === "onclick") node.onclick = v;
    else if (k.startsWith("data-")) node.setAttribute(k, v);
    else node.setAttribute(k, v);
  });
  if (html) node.innerHTML = html;
  return node;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}`);
  return await res.json();
}

function normalizeLesson(l) {
  // legacy: { text } -> map into explanation
  const obj = { ...l };
  if (!obj.objective && obj.text) obj.objective = "";
  if (!obj.explanation && obj.text) obj.explanation = obj.text;

  // V2 fields default
  if (!obj.outline) {
    obj.outline = [
      "Objectif",
      "Explication",
      obj.example ? "Exemple" : null,
      obj.takeaways ? "À retenir" : null,
      obj.traps ? "Pièges" : null,
      obj.checklist ? "Checklist cabinet" : null,
      obj.mini_exercise ? "Mini-exercice" : null
    ].filter(Boolean);
  }
  return obj;
}

function mergeData(target, src) {
  if (src.lessons) target.lessons.push(...src.lessons.map(normalizeLesson));
  if (src.qcm) target.qcm.push(...src.qcm);
  if (src.cases) target.cases.push(...src.cases);
  if (src.meta?.title && !target.title) target.title = src.meta.title;
}

async function loadAll() {
  const index = await fetchJson(DB_INDEX_URL);
  state.modules = index.modules || [];

  // preload modules content
  for (const m of state.modules) {
    const bucket = { title: m.title, lessons: [], qcm: [], cases: [], sources: m.sources || [] };
    for (const src of (m.sources || [])) {
      const data = await fetchJson(src);
      mergeData(bucket, data);
    }
    // sort lessons by id or keep stable order
    bucket.lessons = bucket.lessons.filter(Boolean);
    state.dataByModuleId[m.id] = bucket;
  }
}

function mountBaseUI() {
  const root = $("#app") || document.body;
  root.innerHTML = `
    <div class="fp-shell">
      <header class="fp-topbar">
        <button class="fp-iconbtn" id="btnMenu" aria-label="Menu">☰</button>
        <div class="fp-brand">
          <div class="fp-title">FiscoPilot <span class="fp-accent">AI ELITE MAX</span> 🇧🇪</div>
          <div class="fp-sub">Mode PWA • Offline-ready • Build ${APP_BUILD}</div>
        </div>
        <div class="fp-status" id="netBadge">•</div>
      </header>

      <main class="fp-main" id="main"></main>

      <div class="fp-drawer" id="drawer" aria-hidden="true">
        <div class="fp-drawerCard">
          <div class="fp-drawerHead">
            <div class="fp-drawerTitle">Menu</div>
            <button class="fp-iconbtn" id="btnCloseDrawer" aria-label="Fermer">✕</button>
          </div>
          <div class="fp-drawerBody">
            <button class="fp-btn fp-btnGhost" id="navModules">📚 Modules</button>
            <button class="fp-btn fp-btnGhost" id="navForce">🔄 Forcer refresh</button>
            <div class="fp-divider"></div>
            <div class="fp-muted">Astuce : si tu modifies les JSON, incrémente APP_BUILD dans app.js et CACHE_NAME dans sw.js.</div>
          </div>
        </div>
      </div>

      <div class="fp-modal" id="modal" aria-hidden="true"></div>
    </div>
  `;

  // drawer events
  $("#btnMenu").onclick = () => openDrawer(true);
  $("#btnCloseDrawer").onclick = () => openDrawer(false);
  $("#drawer").onclick = (e) => { if (e.target.id === "drawer") openDrawer(false); };

  $("#navModules").onclick = () => { openDrawer(false); goModules(); };
  $("#navForce").onclick = async () => {
    openDrawer(false);
    await hardRefresh();
  };

  // network badge
  const updateNet = () => {
    const online = navigator.onLine;
    const b = $("#netBadge");
    if (!b) return;
    b.className = "fp-status " + (online ? "on" : "off");
    b.textContent = online ? "En ligne" : "Hors ligne";
  };
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();
}

function openDrawer(open) {
  const d = $("#drawer");
  if (!d) return;
  d.setAttribute("aria-hidden", open ? "false" : "true");
  d.classList.toggle("open", open);
}

async function hardRefresh() {
  // try delete caches + reload
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch(e) {}
  location.reload(true);
}

function goModules() {
  state.view = "modules";
  state.activeModule = null;
  state.tab = "lessons";
  render();
}

function goModule(moduleId) {
  state.view = "module";
  state.activeModule = moduleId;
  state.tab = "lessons";
  state.lessonIndex = 0;
  state.search = "";
  render();
}

function setTab(tab) {
  state.tab = tab;
  render();
}

function filteredLessons(all) {
  const q = state.search.trim().toLowerCase();
  if (!q) return all;
  return all.filter(l =>
    (l.title || "").toLowerCase().includes(q) ||
    (l.objective || "").toLowerCase().includes(q) ||
    (l.explanation || "").toLowerCase().includes(q) ||
    (l.module || "").toLowerCase().includes(q)
  );
}

function render() {
  const main = $("#main");
  if (!main) return;

  if (state.view === "modules") {
    main.innerHTML = `
      <section class="fp-hero">
        <div class="fp-h1">Modules</div>
        <div class="fp-muted">Choisis un module. Les cours premium V2 ont un sommaire interne + mini-exercice.</div>
      </section>
      <section class="fp-grid" id="modGrid"></section>
    `;
    const grid = $("#modGrid");
    state.modules.forEach(m => {
      const data = state.dataByModuleId[m.id];
      const lessons = data?.lessons?.length ?? 0;
      const qcm = data?.qcm?.length ?? 0;
      const cases = data?.cases?.length ?? 0;

      const card = el("div", { class: "fp-card fp-cardHover" }, `
        <div class="fp-cardRow">
          <div>
            <div class="fp-cardTitle">📚 ${esc(m.title)}</div>
            <div class="fp-muted small">Cours: ${lessons} • QCM: ${qcm} • Cas: ${cases}</div>
            <div class="fp-muted tiny">Sources: ${(m.sources || []).map(esc).join(", ")}</div>
          </div>
          <button class="fp-btn fp-btnPrimary">Ouvrir</button>
        </div>
      `);
      card.querySelector("button").onclick = () => goModule(m.id);
      grid.appendChild(card);
    });
    return;
  }

  // Module view
  const mod = state.modules.find(x => x.id === state.activeModule);
  const data = state.dataByModuleId[state.activeModule];
  if (!mod || !data) {
    main.innerHTML = `<div class="fp-card">Erreur chargement module.</div>`;
    return;
  }

  const lessonsAll = data.lessons || [];
  const lessons = filteredLessons(lessonsAll);

  main.innerHTML = `
    <section class="fp-hero">
      <div class="fp-row">
        <div>
          <div class="fp-h1">${esc(mod.title)}</div>
          <div class="fp-muted">Cours: ${lessonsAll.length} • QCM: ${(data.qcm||[]).length} • Cas: ${(data.cases||[]).length}</div>
          <div class="fp-muted tiny">Sources: ${(mod.sources || []).map(esc).join(", ")}</div>
        </div>
        <button class="fp-btn fp-btnGhost" id="btnBack">← Retour</button>
      </div>

      <div class="fp-tabs">
        <button class="fp-tab ${state.tab==="lessons"?"active":""}" id="tabLessons">📘 Cours</button>
        <button class="fp-tab ${state.tab==="qcm"?"active":""}" id="tabQcm">🧪 QCM</button>
        <button class="fp-tab ${state.tab==="cases"?"active":""}" id="tabCases">🧾 Cas</button>
      </div>
    </section>

    <section class="fp-card">
      <div class="fp-row fp-rowWrap">
        <input class="fp-input" id="search" placeholder="Rechercher (ex: prorata, facture, intracom...)"
          value="${esc(state.search)}" />
        <button class="fp-btn fp-btnPrimary" id="btnRandom">Cours aléatoire</button>
      </div>
    </section>

    <section id="content"></section>
  `;

  $("#btnBack").onclick = () => goModules();
  $("#tabLessons").onclick = () => setTab("lessons");
  $("#tabQcm").onclick = () => setTab("qcm");
  $("#tabCases").onclick = () => setTab("cases");

  $("#search").oninput = (e) => { state.search = e.target.value; render(); };

  $("#btnRandom").onclick = () => {
    if (!lessons.length) return;
    const idx = Math.floor(Math.random() * lessons.length);
    openLesson(lessons[idx], lessons, idx);
  };

  const content = $("#content");
  if (state.tab === "lessons") {
    content.innerHTML = renderLessonsList(lessons);
    bindLessonButtons(lessons);
  } else if (state.tab === "qcm") {
    content.innerHTML = renderQcm(data.qcm || []);
  } else {
    content.innerHTML = renderCases(data.cases || []);
  }
}

function renderLessonsList(lessons) {
  if (!lessons.length) return `<div class="fp-card">Aucun cours trouvé.</div>`;

  return `
    <div class="fp-list">
      ${lessons.map((l, i) => `
        <div class="fp-item">
          <div>
            <div class="fp-itemTitle">${i+1}. ${esc(l.title)}</div>
            <div class="fp-pillRow">
              <span class="fp-pill">${esc(l.level || "•")}</span>
              <span class="fp-pill ghost">📌 ${esc(l.module || "")}</span>
            </div>
          </div>
          <button class="fp-btn fp-btnGhost fp-openLesson" data-idx="${i}">Ouvrir</button>
        </div>
      `).join("")}
    </div>
  `;
}

function bindLessonButtons(lessons) {
  document.querySelectorAll(".fp-openLesson").forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      openLesson(lessons[idx], lessons, idx);
    };
  });
}

function sectionId(label) {
  return label
    .toLowerCase()
    .replaceAll("à", "a").replaceAll("é","e").replaceAll("è","e").replaceAll("ê","e")
    .replaceAll("’","").replaceAll("'","")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function renderLessonModal(lesson, list, idx) {
  const outline = lesson.outline || [];
  const toc = outline.map(label => {
    const id = sectionId(label);
    return `<a class="fp-tocLink" href="#${id}" data-jump="${id}">${esc(label)}</a>`;
  }).join("");

  const parts = [];

  if (lesson.objective) parts.push(`
    <section class="fp-sec" id="${sectionId("Objectif")}">
      <div class="fp-secTitle">OBJECTIF</div>
      <div class="fp-text">${esc(lesson.objective).replaceAll("\n","<br/>")}</div>
    </section>
  `);

  if (lesson.explanation) parts.push(`
    <section class="fp-sec" id="${sectionId("Explication")}">
      <div class="fp-secTitle">EXPLICATION</div>
      <div class="fp-text">${esc(lesson.explanation).replaceAll("\n","<br/>")}</div>
    </section>
  `);

  if (lesson.example) parts.push(`
    <section class="fp-sec" id="${sectionId("Exemple chiffré")}">
      <div class="fp-secTitle">EXEMPLE</div>
      <pre class="fp-pre">${esc(lesson.example)}</pre>
    </section>
  `);

  if (lesson.takeaways && Array.isArray(lesson.takeaways)) parts.push(`
    <section class="fp-sec" id="${sectionId("A retenir")}">
      <div class="fp-secTitle">À RETENIR</div>
      <ul class="fp-ul">${lesson.takeaways.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    </section>
  `);

  if (lesson.traps) parts.push(`
    <section class="fp-sec" id="${sectionId("Pieg es")}">
      <div class="fp-secTitle">PIÈGES</div>
      <div class="fp-text">${esc(lesson.traps).replaceAll("\n","<br/>")}</div>
    </section>
  `);

  if (lesson.checklist) parts.push(`
    <section class="fp-sec" id="${sectionId("Checklist cabinet")}">
      <div class="fp-secTitle">CHECKLIST CABINET</div>
      <pre class="fp-pre">${esc(lesson.checklist)}</pre>
    </section>
  `);

  if (lesson.mini_exercise?.question) parts.push(`
    <section class="fp-sec" id="${sectionId("Mini-exercice")}">
      <div class="fp-secTitle">MINI-EXERCICE</div>
      <div class="fp-text"><b>Question</b><br/>${esc(lesson.mini_exercise.question).replaceAll("\n","<br/>")}</div>
      <details class="fp-details">
        <summary>Voir correction</summary>
        <pre class="fp-pre">${esc(lesson.mini_exercise.answer || "")}</pre>
      </details>
    </section>
  `);

  return `
    <div class="fp-modalInner">
      <div class="fp-modalCard">
        <div class="fp-modalHead">
          <button class="fp-iconbtn" id="btnCloseModal" aria-label="Fermer">✕</button>
          <div class="fp-modalTitle">
            <div class="fp-pillRow">
              <span class="fp-pill">${esc(lesson.level || "")}</span>
              <span class="fp-pill ghost">${idx+1}/${list.length}</span>
            </div>
            <div class="fp-h2">${esc(lesson.title)}</div>
          </div>
          <button class="fp-iconbtn" id="btnToc" aria-label="Sommaire">≡</button>
        </div>

        <div class="fp-modalBody">
          <div class="fp-toc" id="toc">
            <div class="fp-tocTitle">Sommaire rapide</div>
            ${toc || `<div class="fp-muted">Aucun sommaire.</div>`}
          </div>

          <article class="fp-article" id="article">
            ${parts.join("")}
          </article>
        </div>

        <div class="fp-modalFoot">
          <button class="fp-btn fp-btnGhost" id="btnPrev">◀ Précédent</button>
          <button class="fp-btn fp-btnPrimary" id="btnNext">Suivant ▶</button>
        </div>
      </div>
    </div>
  `;
}

function openLesson(lesson, list, idx) {
  const modal = $("#modal");
  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("open");
  modal.innerHTML = renderLessonModal(lesson, list, idx);

  $("#btnCloseModal").onclick = closeModal;
  modal.onclick = (e) => { if (e.target.id === "modal") closeModal(); };

  const toc = $("#toc");
  $("#btnToc").onclick = () => toc.classList.toggle("open");

  // toc jump without reloading hash behavior issues inside modal
  document.querySelectorAll("[data-jump]").forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      const id = a.getAttribute("data-jump");
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      toc.classList.remove("open");
    };
  });

  $("#btnPrev").onclick = () => {
    const prev = Math.max(0, idx - 1);
    openLesson(list[prev], list, prev);
  };
  $("#btnNext").onclick = () => {
    const next = Math.min(list.length - 1, idx + 1);
    openLesson(list[next], list, next);
  };
}

function closeModal() {
  const modal = $("#modal");
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("open");
  modal.innerHTML = "";
}

function renderQcm(qcm) {
  if (!qcm.length) return `<div class="fp-card">Aucun QCM.</div>`;
  return `
    <div class="fp-card">
      <div class="fp-h2">QCM</div>
      <div class="fp-muted">Ici on gardera ton système de tirage aléatoire / sessions si tu veux.</div>
      <div class="fp-divider"></div>
      ${qcm.slice(0, 20).map((q, i) => `
        <div class="fp-q">
          <div class="fp-qTitle">${i+1}. ${esc(q.question || "")}</div>
          <ol class="fp-ol">
            ${(q.choices || []).map(c => `<li>${esc(c)}</li>`).join("")}
          </ol>
          <div class="fp-muted tiny">Réponse: ${typeof q.answer === "number" ? (q.answer + 1) : "-"}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCases(cases) {
  if (!cases.length) return `<div class="fp-card">Aucun cas.</div>`;
  return `
    <div class="fp-card">
      <div class="fp-h2">Cas pratiques</div>
      <div class="fp-divider"></div>
      ${cases.slice(0, 20).map((c, i) => `
        <div class="fp-q">
          <div class="fp-qTitle">${i+1}. ${esc(c.title || "")} <span class="fp-pill ghost">${esc(c.level || "")}</span></div>
          <div class="fp-text">${esc(c.question || "").replaceAll("\n","<br/>")}</div>
          ${c.answer_md ? `<details class="fp-details"><summary>Voir correction</summary><pre class="fp-pre">${esc(c.answer_md)}</pre></details>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

(async function boot() {
  mountBaseUI();
  try {
    await loadAll();
    goModules();
  } catch (e) {
    const main = $("#main");
    main.innerHTML = `<div class="fp-card">Erreur chargement: ${esc(e.message)}</div>`;
  }
})();