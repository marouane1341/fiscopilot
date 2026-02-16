// =================== Utils ===================
async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(path + " -> HTTP " + res.status);
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

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =================== Modules list ===================
async function loadModules() {
  const list = document.getElementById("modulesList");
  if (!list) return;

  list.innerHTML = "⏳ Chargement des modules...";

  try {
    const idx = await fetchJSON("db_index.json");
    const mods = idx.modules || [];
    list.innerHTML = "";

    if (!mods.length) {
      list.innerHTML = "Aucun module trouvé dans db_index.json";
      return;
    }

    mods.forEach((m) => {
      const btn = document.createElement("button");
      btn.className = "navitem";
      btn.style.cursor = "pointer";
      btn.innerHTML = `📚 <b>${m.title}</b><div style="opacity:.7;font-size:13px;margin-top:4px;">Appuie pour ouvrir</div>`;
      btn.onclick = () => openModule(m.db_url, m.title);
      list.appendChild(btn);
    });
  } catch (e) {
    list.innerHTML = "❌ Erreur loadModules: " + e.message;
  }
}

// =================== Module view (cours + quiz + cas) ===================
let MODULE = {
  title: "",
  dbUrl: "",
  data: null,
  quiz: { pool: [], i: 0, score: 0 }
};

async function openModule(dbUrl, title) {
  const list = document.getElementById("modulesList");
  if (!list) return;

  list.innerHTML = `⏳ Ouverture du module <b>${escapeHtml(title)}</b>...`;

  try {
    const data = await fetchJSON(dbUrl);

    MODULE = {
      title,
      dbUrl,
      data,
      quiz: { pool: [], i: 0, score: 0 }
    };

    const lessons = data.lessons || [];
    const questions = data.questions || [];
    const cases = data.cases || [];

    list.innerHTML = `
      <div style="padding:12px;background:#0d1f3c;border-radius:12px;">
        <div style="font-size:18px;font-weight:800;margin-bottom:4px;">${escapeHtml(title)}</div>
        <div style="opacity:.7;margin-bottom:10px;">Source: <code>${escapeHtml(dbUrl)}</code></div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
          <div style="opacity:.9;">📚 Cours: <b>${lessons.length}</b></div>
          <div style="opacity:.9;">🧪 QCM: <b>${questions.length}</b></div>
          <div style="opacity:.9;">🧾 Cas: <b>${cases.length}</b></div>
        </div>

        <div style="padding:12px;background:#112a52;border-radius:12px;margin-bottom:12px;">
          <div style="font-weight:800;margin-bottom:8px;">📚 Cours</div>
          <div id="lessonList"></div>
          <div id="lessonBox" style="margin-top:10px; display:none;"></div>
        </div>

        <div style="padding:12px;background:#112a52;border-radius:12px;margin-bottom:12px;">
          <div style="font-weight:800;margin-bottom:8px;">🧪 QCM</div>
          <button class="btn" onclick="startQuiz()">Lancer 5 questions (aléatoire)</button>
          <div id="quizBox" style="margin-top:10px;"></div>
        </div>

        <div style="padding:12px;background:#112a52;border-radius:12px;">
          <div style="font-weight:800;margin-bottom:8px;">🧾 Cas pratiques</div>
          <button class="btn" onclick="showRandomCase()">Cas aléatoire</button>
          <div id="caseBox" style="margin-top:10px;"></div>
        </div>

        <button class="btn" style="margin-top:12px;" onclick="loadModules()">⬅ Retour aux modules</button>
      </div>
    `;

    renderLessonList();
  } catch (e) {
    list.innerHTML = "❌ Erreur ouverture module: " + e.message;
  }
}

// =================== Cours (liste + affichage) ===================
function renderLessonList() {
  const data = MODULE.data || {};
  const lessons = data.lessons || [];
  const lessonList = document.getElementById("lessonList");
  const lessonBox = document.getElementById("lessonBox");
  if (!lessonList || !lessonBox) return;

  lessonList.innerHTML = "";

  if (!lessons.length) {
    lessonList.innerHTML = `<div style="opacity:.7">Aucun cours.</div>`;
    return;
  }

  lessons.forEach((l, idx) => {
    const b = document.createElement("button");
    b.className = "navitem";
    b.style.margin = "6px 0";
    b.style.cursor = "pointer";
    b.innerHTML = `${idx + 1}. <b>${escapeHtml(l.title)}</b>`;
    b.onclick = () => showLesson(idx);
    lessonList.appendChild(b);
  });

  // Ouvre le premier cours par défaut (mais tu peux changer)
  showLesson(0);
}

function showLesson(index) {
  const lessons = (MODULE.data && MODULE.data.lessons) ? MODULE.data.lessons : [];
  const l = lessons[index];
  const lessonBox = document.getElementById("lessonBox");
  if (!l || !lessonBox) return;

  lessonBox.style.display = "block";
  lessonBox.style.background = "#0d1f3c";
  lessonBox.style.padding = "12px";
  lessonBox.style.borderRadius = "12px";
  lessonBox.innerHTML = `
    <div style="font-weight:900;margin-bottom:8px;">${escapeHtml(l.title)}</div>
    <div style="opacity:.95; line-height:1.5;">${escapeHtml(l.text).replace(/\n/g, "<br/>")}</div>
  `;
}

// =================== QCM (5 questions aléatoires) ===================
function startQuiz() {
  const data = MODULE.data || {};
  const poolAll = data.questions || [];
  const quizBox = document.getElementById("quizBox");
  if (!quizBox) return;

  if (!poolAll.length) {
    quizBox.innerHTML = "Aucune question.";
    return;
  }

  const shuffled = shuffle(poolAll);
  MODULE.quiz.pool = shuffled.slice(0, Math.min(5, shuffled.length));
  MODULE.quiz.i = 0;
  MODULE.quiz.score = 0;

  renderQuizQuestion();
}

function renderQuizQuestion() {
  const quizBox = document.getElementById("quizBox");
  if (!quizBox) return;

  const { pool, i, score } = MODULE.quiz;
  const q = pool[i];

  if (!q) {
    quizBox.innerHTML = `<b>✅ Quiz terminé</b><div style="margin-top:6px;">Score: <b>${score}</b> / ${pool.length}</div>
      <button class="btn" style="margin-top:10px;" onclick="startQuiz()">Relancer (nouvel aléatoire)</button>`;
    return;
  }

  quizBox.innerHTML = `
    <div style="font-weight:900;margin-bottom:10px;">(${i + 1}/${pool.length}) ${escapeHtml(q.q)}</div>
    ${q.o.map((opt, idx) => `
      <button class="navitem" style="margin:6px 0;" onclick="answerQuiz(${idx})">${escapeHtml(opt)}</button>
    `).join("")}
    <div id="quizFeedback" style="margin-top:10px;opacity:.9"></div>
  `;
}

function answerQuiz(choice) {
  const fb = document.getElementById("quizFeedback");
  const q = MODULE.quiz.pool[MODULE.quiz.i];
  if (!q || !fb) return;

  if (choice === q.a) {
    MODULE.quiz.score++;
    fb.innerHTML = "✅ Correct";
  } else {
    fb.innerHTML = `❌ Faux — Réponse: <b>${escapeHtml(q.o[q.a])}</b><br/><small>${escapeHtml(q.exp || "")}</small>`;
  }

  setTimeout(() => {
    MODULE.quiz.i++;
    renderQuizQuestion();
  }, 700);
}

// =================== Cas aléatoire ===================
let _lastCaseIndex = -1;

function showRandomCase() {
  const data = MODULE.data || {};
  const cases = data.cases || [];
  const box = document.getElementById("caseBox");
  if (!box) return;

  if (!cases.length) {
    box.innerHTML = "Aucun cas.";
    return;
  }

  // évite de retomber sur le même cas à la suite si possible
  let idx = Math.floor(Math.random() * cases.length);
  if (cases.length > 1 && idx === _lastCaseIndex) {
    idx = (idx + 1) % cases.length;
  }
  _lastCaseIndex = idx;

  const c = cases[idx];

  box.innerHTML = `
    <div style="font-weight:900;margin-bottom:8px;">Question</div>
    <div style="opacity:.95">${escapeHtml(c.q)}</div>
    <button class="btn" style="margin-top:10px;" onclick="revealCaseAnswer(${idx})">Voir correction</button>
    <button class="btn" style="margin-top:10px; margin-left:8px;" onclick="showRandomCase()">Nouveau cas</button>
    <div id="caseAnswer" style="display:none; margin-top:10px; opacity:.95;"></div>
  `;
}

function revealCaseAnswer(idx) {
  const data = MODULE.data || {};
  const cases = data.cases || [];
  const ans = document.getElementById("caseAnswer");
  if (!ans || !cases[idx]) return;

  ans.style.display = "block";
  ans.innerHTML = `<b>Correction :</b><br/>${escapeHtml(cases[idx].a).replace(/\n/g, "<br/>")}`;
}

// =================== Sync + Tutor minimal ===================
async function syncNow() {
  const status = document.getElementById("syncStatus");
  if (status) status.innerHTML = "⏳ Synchronisation...";

  try {
    const idx = await fetchJSON("db_index.json");
    if (status) status.innerHTML = "✅ Sync OK (" + (idx.updated_at || "ok") + ")";
    await loadModules();
  } catch (e) {
    if (status) status.innerHTML = "⚠️ Sync impossible — " + e.message;
  }
}

function tutorAskOffline() {
  const q = (document.getElementById("tutorQ").value || "").toLowerCase();
  const out = document.getElementById("tutorA");
  if (!q) { out.innerHTML = "Pose une question."; return; }

  if (q.includes("tva")) out.innerHTML = "TVA: impôt indirect. Réflexe: taxable ? taux/base ? déduction/prorata/régularisation ?";
  else out.innerHTML = "Mode local: base minimale. On enrichit module par module.";
}

// Auto-load modules
window.addEventListener("load", loadModules);