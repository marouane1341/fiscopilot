/* =========================
   FiscoPilot - app.js (FULL)
   - Modules via db_index.json
   - Cours / QCM / Cas (aléatoires)
   - Compatible anciens/nouveaux JSON
========================= */

"use strict";

/* ---------- Helpers ---------- */
function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return await res.json();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandomIndex(max, avoid = null) {
  if (max <= 1) return 0;
  let i = Math.floor(Math.random() * max);
  if (avoid !== null && i === avoid) i = (i + 1) % max;
  return i;
}

function pickRandomItems(arr, n) {
  return shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)));
}

function normalizeModuleData(raw) {
  // Support:
  // - lessons: [{title, text}] OU [{title, sections:[{h,md}]}]
  // - qcm: [{question, choices, answer, explain}] OU questions: [{q,o,a,exp}]
  // - cases: [{question, answer_md}] OU [{q,a}]
  const lessons = Array.isArray(raw.lessons) ? raw.lessons : [];
  const qcmA = Array.isArray(raw.qcm) ? raw.qcm : [];
  const qcmB = Array.isArray(raw.questions) ? raw.questions : [];
  const casesA = Array.isArray(raw.cases) ? raw.cases : [];

  const qcm = [];

  // New format qcm
  for (const x of qcmA) {
    if (!x) continue;
    qcm.push({
      id: x.id || "",
      q: x.question ?? x.q ?? "",
      o: x.choices ?? x.o ?? [],
      a: typeof x.answer === "number" ? x.answer : (typeof x.a === "number" ? x.a : 0),
      exp: x.explain ?? x.exp ?? ""
    });
  }

  // Old format questions
  for (const x of qcmB) {
    if (!x) continue;
    qcm.push({
      id: x.id || "",
      q: x.q ?? "",
      o: x.o ?? [],
      a: typeof x.a === "number" ? x.a : 0,
      exp: x.exp ?? ""
    });
  }

  // Cases normalize
  const cases = casesA.map((c) => ({
    id: c.id || "",
    title: c.title || "",
    q: c.question ?? c.q ?? "",
    a: c.answer_md ?? c.a ?? ""
  }));

  return { meta: raw.meta || {}, lessons, qcm, cases };
}

/* ---------- UI: Menu (si tu l’utilises) ---------- */
function toggleMenu() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".overlay");
  if (sidebar) sidebar.classList.toggle("open");
  if (overlay) overlay.classList.toggle("show");
}
window.toggleMenu = toggleMenu;

/* ---------- App State ---------- */
const STATE = {
  modulesIndex: null,
  currentModule: null, // {title, db_url, dataNormalized}
  currentLessonIndex: 0,
  currentCaseIndex: -1,
  quiz: {
    pool: [],
    i: 0,
    score: 0,
    locked: false
  }
};

/* ---------- Render Modules List ---------- */
async function loadModules() {
  const box = $("modulesList");
  if (!box) return;

  box.innerHTML = "⏳ Chargement...";

  try {
    let idx;
    try {
      idx = await fetchJSON("db_index.json");
    } catch (e) {
      // fallback si pas d’index
      idx = {
        modules: [
          { id: "tva", title: "TVA Belgique", db_url: "db/tva.json" }
        ]
      };
    }

    STATE.modulesIndex = idx;
    const modules = Array.isArray(idx.modules) ? idx.modules : [];

    box.innerHTML = "";

    if (!modules.length) {
      box.innerHTML = "❌ Aucun module trouvé (db_index.json vide ?).";
      return;
    }

    for (const m of modules) {
      const btn = document.createElement("button");
      btn.className = "navitem";
      btn.innerHTML = `📚 <b>${escapeHtml(m.title || "Module")}</b>
        <div style="opacity:.7;font-size:13px;margin-top:4px;">Appuie pour ouvrir</div>`;
      btn.onclick = () => openModule(m.db_url || m.dbUrl || m.path, m.title || "Module");
      box.appendChild(btn);
    }
  } catch (e) {
    box.innerHTML = "❌ Erreur loadModules: " + escapeHtml(e.message);
  }
}
window.loadModules = loadModules;

/* ---------- Open Module ---------- */
async function openModule(dbUrl, title) {
  const box = $("modulesList");
  if (!box) return;

  box.innerHTML = `⏳ Ouverture de <b>${escapeHtml(title)}</b>...`;

  try {
    const raw = await fetchJSON(dbUrl);
    const data = normalizeModuleData(raw);

    STATE.currentModule = { title, dbUrl, data };
    STATE.currentLessonIndex = 0;
    STATE.currentCaseIndex = -1;
    STATE.quiz = { pool: [], i: 0, score: 0, locked: false };

    renderModuleView();
  } catch (e) {
    box.innerHTML = `❌ Erreur ouverture module: ${escapeHtml(e.message)}`;
  }
}

/* ---------- Render Module View ---------- */
function renderModuleView() {
  const box = $("modulesList");
  if (!box || !STATE.currentModule) return;

  const { title, dbUrl, data } = STATE.currentModule;
  const lessonsCount = data.lessons.length;
  const qcmCount = data.qcm.length;
  const casesCount = data.cases.length;

  box.innerHTML = `
    <div class="card">
      <div style="font-size:20px;font-weight:900;margin-bottom:6px;">${escapeHtml(title)}</div>
      <div style="opacity:.7;margin-bottom:10px;">Source: <code>${escapeHtml(dbUrl)}</code></div>

      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; opacity:.95;">
        <div>📚 Cours: <b>${lessonsCount}</b></div>
        <div>🧪 QCM: <b>${qcmCount}</b></div>
        <div>🧾 Cas: <b>${casesCount}</b></div>
      </div>

      <!-- COURS -->
      <div class="card" style="background:#112a52;">
        <div style="font-weight:900;margin-bottom:10px;">📚 Cours</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
          <button class="btn" onclick="lessonRandom()">Cours aléatoire</button>
          <button class="btn" onclick="lessonPrev()">◀ Précédent</button>
          <button class="btn" onclick="lessonNext()">Suivant ▶</button>
        </div>
        <div id="lessonList" style="margin-bottom:10px;"></div>
        <div id="lessonBox"></div>
      </div>

      <!-- QCM -->
      <div class="card" style="background:#112a52;">
        <div style="font-weight:900;margin-bottom:10px;">🧪 QCM</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
          <button class="btn" onclick="startQuiz(5)">Lancer 5 questions (aléatoire)</button>
          <button class="btn" onclick="startQuiz(10)">Lancer 10 questions (aléatoire)</button>
        </div>
        <div id="quizBox"></div>
      </div>

      <!-- CAS -->
      <div class="card" style="background:#112a52;">
        <div style="font-weight:900;margin-bottom:10px;">🧾 Cas pratiques</div>
        <button class="btn" onclick="showRandomCase()">Cas aléatoire</button>
        <div id="caseBox" style="margin-top:10px;"></div>
      </div>

      <button class="btn" onclick="loadModules()">⬅ Retour aux modules</button>
    </div>
  `;

  renderLessonList();
  renderLesson();
  renderQuizIdle();
  renderCaseIdle();
}

/* ---------- Lessons ---------- */
function renderLessonList() {
  const list = $("lessonList");
  if (!list || !STATE.currentModule) return;

  const lessons = STATE.currentModule.data.lessons;

  if (!lessons.length) {
    list.innerHTML = `<div style="opacity:.7">Aucun cours disponible.</div>`;
    return;
  }

  // Liste cliquable (compacte)
  const maxShow = Math.min(12, lessons.length); // évite liste énorme sur mobile
  const items = [];
  for (let i = 0; i < maxShow; i++) {
    items.push(`
      <button class="navitem" style="margin:6px 0;" onclick="lessonGo(${i})">
        ${i + 1}. ${escapeHtml(lessons[i].title || "Cours")}
      </button>
    `);
  }

  const more = lessons.length > maxShow
    ? `<div style="opacity:.7;margin-top:8px;">… +${lessons.length - maxShow} autres cours (utilise Précédent/Suivant ou Aléatoire)</div>`
    : "";

  list.innerHTML = items.join("") + more;
}

function lessonGo(i) {
  if (!STATE.currentModule) return;
  const lessons = STATE.currentModule.data.lessons;
  if (!lessons.length) return;
  STATE.currentLessonIndex = Math.max(0, Math.min(i, lessons.length - 1));
  renderLesson();
}
window.lessonGo = lessonGo;

function lessonPrev() {
  if (!STATE.currentModule) return;
  const lessons = STATE.currentModule.data.lessons;
  if (!lessons.length) return;
  STATE.currentLessonIndex = (STATE.currentLessonIndex - 1 + lessons.length) % lessons.length;
  renderLesson();
}
window.lessonPrev = lessonPrev;

function lessonNext() {
  if (!STATE.currentModule) return;
  const lessons = STATE.currentModule.data.lessons;
  if (!lessons.length) return;
  STATE.currentLessonIndex = (STATE.currentLessonIndex + 1) % lessons.length;
  renderLesson();
}
window.lessonNext = lessonNext;

function lessonRandom() {
  if (!STATE.currentModule) return;
  const lessons = STATE.currentModule.data.lessons;
  if (!lessons.length) return;
  STATE.currentLessonIndex = pickRandomIndex(lessons.length, STATE.currentLessonIndex);
  renderLesson();
}
window.lessonRandom = lessonRandom;

function renderLesson() {
  const box = $("lessonBox");
  if (!box || !STATE.currentModule) return;

  const lessons = STATE.currentModule.data.lessons;
  if (!lessons.length) {
    box.innerHTML = "";
    return;
  }

  const l = lessons[STATE.currentLessonIndex];

  // Support 2 formats:
  // - {text}
  // - {sections:[{h,md}]}
  let contentHtml = "";

  if (Array.isArray(l.sections) && l.sections.length) {
    contentHtml = l.sections.map((s) => `
      <div style="margin-bottom:12px;">
        <div style="font-weight:900;margin-bottom:6px;">${escapeHtml(s.h || "")}</div>
        <div style="opacity:.95; line-height:1.55;">${escapeHtml(s.md || "").replace(/\n/g, "<br/>")}</div>
      </div>
    `).join("");
  } else {
    contentHtml = `<div style="opacity:.95; line-height:1.55;">${escapeHtml(l.text || "").replace(/\n/g, "<br/>")}</div>`;
  }

  box.innerHTML = `
    <div style="background:#0d1f3c;padding:12px;border-radius:12px;">
      <div style="font-weight:900;margin-bottom:8px;">
        (${STATE.currentLessonIndex + 1}/${lessons.length}) ${escapeHtml(l.title || "Cours")}
      </div>
      ${contentHtml}
    </div>
  `;
}

/* ---------- Quiz ---------- */
function renderQuizIdle() {
  const box = $("quizBox");
  if (!box) return;
  box.innerHTML = `<div style="opacity:.75">Appuie sur “Lancer” pour démarrer un QCM aléatoire.</div>`;
}

function startQuiz(n) {
  if (!STATE.currentModule) return;
  const box = $("quizBox");
  if (!box) return;

  const all = STATE.currentModule.data.qcm;
  if (!all.length) {
    box.innerHTML = "Aucune question dans ce module.";
    return;
  }

  const pool = pickRandomItems(all, n);
  STATE.quiz = { pool, i: 0, score: 0, locked: false };
  renderQuizQuestion();
}
window.startQuiz = startQuiz;

function renderQuizQuestion() {
  const box = $("quizBox");
  if (!box) return;

  const { pool, i, score } = STATE.quiz;
  const q = pool[i];

  if (!q) {
    box.innerHTML = `
      <div style="font-weight:900;">✅ Quiz terminé</div>
      <div style="margin-top:6px;">Score: <b>${score}</b> / ${pool.length}</div>
      <button class="btn" style="margin-top:10px;" onclick="startQuiz(${pool.length})">Relancer (nouvel aléatoire)</button>
    `;
    return;
  }

  const opts = (q.o || []).map((opt, idx) => `
    <button class="navitem" style="margin:6px 0;" onclick="answerQuiz(${idx})">
      ${escapeHtml(opt)}
    </button>
  `).join("");

  box.innerHTML = `
    <div style="font-weight:900;margin-bottom:10px;">
      (${i + 1}/${pool.length}) ${escapeHtml(q.q)}
    </div>
    ${opts}
    <div id="quizFeedback" style="margin-top:10px;opacity:.95"></div>
  `;
}
window.renderQuizQuestion = renderQuizQuestion;

function answerQuiz(choice) {
  if (STATE.quiz.locked) return;
  STATE.quiz.locked = true;

  const fb = $("quizFeedback");
  const q = STATE.quiz.pool[STATE.quiz.i];
  if (!q || !fb) {
    STATE.quiz.locked = false;
    return;
  }

  const correct = choice === q.a;
  if (correct) {
    STATE.quiz.score++;
    fb.innerHTML = "✅ Correct";
  } else {
    const correctText = (q.o && q.o[q.a]) ? q.o[q.a] : "(réponse)";
    fb.innerHTML = `❌ Faux — Réponse: <b>${escapeHtml(correctText)}</b><br/>
      <small>${escapeHtml(q.exp || "")}</small>`;
  }

  setTimeout(() => {
    STATE.quiz.i++;
    STATE.quiz.locked = false;
    renderQuizQuestion();
  }, 650);
}
window.answerQuiz = answerQuiz;

/* ---------- Cases ---------- */
function renderCaseIdle() {
  const box = $("caseBox");
  if (!box) return;
  box.innerHTML = `<div style="opacity:.75">Appuie sur “Cas aléatoire”.</div>`;
}

function showRandomCase() {
  if (!STATE.currentModule) return;
  const box = $("caseBox");
  if (!box) return;

  const cases = STATE.currentModule.data.cases;
  if (!cases.length) {
    box.innerHTML = "Aucun cas pratique.";
    return;
  }

  const idx = pickRandomIndex(cases.length, STATE.currentCaseIndex);
  STATE.currentCaseIndex = idx;

  const c = cases[idx];

  box.innerHTML = `
    ${c.title ? `<div style="font-weight:900;margin-bottom:6px;">${escapeHtml(c.title)}</div>` : ""}
    <div style="font-weight:900;margin-bottom:8px;">Question</div>
    <div style="opacity:.95">${escapeHtml(c.q).replace(/\n/g, "<br/>")}</div>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
      <button class="btn" onclick="revealCaseAnswer()">Voir correction</button>
      <button class="btn" onclick="showRandomCase()">Nouveau cas</button>
    </div>

    <div id="caseAnswer" style="display:none; margin-top:10px; opacity:.95;"></div>
  `;
}
window.showRandomCase = showRandomCase;

function revealCaseAnswer() {
  const ans = $("caseAnswer");
  if (!ans || !STATE.currentModule) return;

  const cases = STATE.currentModule.data.cases;
  const c = cases[STATE.currentCaseIndex];
  if (!c) return;

  ans.style.display = "block";
  ans.innerHTML = `<b>Correction :</b><br/>${escapeHtml(c.a).replace(/\n/g, "<br/>")}`;
}
window.revealCaseAnswer = revealCaseAnswer;

/* ---------- Boot ---------- */
window.addEventListener("load", loadModules);