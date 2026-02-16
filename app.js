let CURRENT_MODULE = null;

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

async function loadModules() {
  const list = document.getElementById("modulesList");
  list.innerHTML = "Chargement...";

  try {
    const idx = await fetchJSON("db_index.json");
    list.innerHTML = "";

    idx.modules.forEach(m => {
      const div = document.createElement("div");
      div.style.marginBottom = "10px";
      div.style.padding = "12px";
      div.style.background = "#112a52";
      div.style.borderRadius = "10px";
      div.style.cursor = "pointer";
      div.innerHTML = `<b>${m.title}</b><div style="opacity:.7;font-size:13px;margin-top:4px;">Appuie pour ouvrir</div>`;

      div.addEventListener("click", () => openModule(m));
      list.appendChild(div);
    });

  } catch (e) {
    list.innerHTML = "Erreur chargement modules: " + e.message;
  }
}

async function openModule(m) {
  CURRENT_MODULE = m;

  // On remplace l'écran Modules par le contenu du module
  const list = document.getElementById("modulesList");
  list.innerHTML = "⏳ Chargement du module...";

  try {
    const data = await fetchJSON(m.db_url);

    const lessons = data.lessons || [];
    const qcm = data.questions || [];
    const cases = data.cases || [];

    list.innerHTML = `
      <div style="margin-bottom:10px; opacity:.8">Module: <b>${m.title}</b></div>

      <div style="padding:12px;background:#0d1f3c;border-radius:10px;margin-bottom:12px;">
        <b>📚 Cours (${lessons.length})</b>
        <div id="lessonList" style="margin-top:10px;"></div>
      </div>

      <div style="padding:12px;background:#0d1f3c;border-radius:10px;margin-bottom:12px;">
        <b>🧪 QCM (${qcm.length})</b>
        <button class="btn" style="margin-top:10px;" onclick="startMiniQuiz()">Lancer 5 questions</button>
        <div id="quizBox" style="margin-top:10px;"></div>
      </div>

      <div style="padding:12px;background:#0d1f3c;border-radius:10px;">
        <b>🧾 Cas pratiques (${cases.length})</b>
        <div id="caseBox" style="margin-top:10px;"></div>
        <button class="btn" style="margin-top:10px;" onclick="showRandomCase()">Cas aléatoire</button>
      </div>

      <button class="btn" style="margin-top:14px;" onclick="loadModules()">⬅ Retour aux modules</button>
    `;

    // Rendre les leçons cliquables
    const lessonList = document.getElementById("lessonList");
    if (!lessons.length) {
      lessonList.innerHTML = `<div style="opacity:.7">Aucune leçon dans ce module.</div>`;
    } else {
      lessons.forEach(l => {
        const item = document.createElement("div");
        item.style.padding = "10px";
        item.style.marginBottom = "8px";
        item.style.borderRadius = "10px";
        item.style.background = "#112a52";
        item.style.cursor = "pointer";
        item.innerHTML = `<b>${l.title}</b>`;
        item.addEventListener("click", () => showLesson(l));
        lessonList.appendChild(item);
      });
    }

    // Affiche un cas direct si dispo
    if (cases.length) showRandomCase();

  } catch (e) {
    list.innerHTML = "Erreur ouverture module: " + e.message;
  }
}

function showLesson(lesson) {
  alert(lesson.title + "\n\n" + lesson.text);
}

// --- Mini quiz ---
let QUIZ = { pool: [], i: 0, score: 0 };

async function startMiniQuiz() {
  const box = document.getElementById("quizBox");
  box.innerHTML = "⏳ Préparation quiz...";

  const data = await fetchJSON(CURRENT_MODULE.db_url);
  const pool = data.questions || [];
  if (!pool.length) {
    box.innerHTML = "Aucune question dans ce module.";
    return;
  }

  QUIZ.pool = shuffle(pool).slice(0, 5);
  QUIZ.i = 0;
  QUIZ.score = 0;
  showQuizQuestion();
}

function showQuizQuestion() {
  const box = document.getElementById("quizBox");
  const q = QUIZ.pool[QUIZ.i];
  if (!q) {
    box.innerHTML = `<b>✅ Terminé</b><div>Score: ${QUIZ.score}/5</div>`;
    return;
  }

  box.innerHTML = `
    <div style="font-weight:700;margin-bottom:10px;">(${QUIZ.i+1}/5) ${q.q}</div>
    ${q.o.map((opt, idx) => `
      <button class="navitem" style="margin:6px 0;" onclick="answerQuiz(${idx})">${opt}</button>
    `).join("")}
    <div id="quizFeedback" style="margin-top:10px;opacity:.85"></div>
  `;
}

function answerQuiz(choice) {
  const q = QUIZ.pool[QUIZ.i];
  const fb = document.getElementById("quizFeedback");

  if (choice === q.a) {
    QUIZ.score++;
    fb.innerHTML = "✅ Correct";
  } else {
    fb.innerHTML = `❌ Faux — Réponse: ${q.o[q.a]}<br><small>${q.exp || ""}</small>`;
  }

  setTimeout(() => {
    QUIZ.i++;
    showQuizQuestion();
  }, 800);
}

// --- Cas pratiques ---
async function showRandomCase() {
  const box = document.getElementById("caseBox");
  const data = await fetchJSON(CURRENT_MODULE.db_url);
  const cases = data.cases || [];
  if (!cases.length) {
    box.innerHTML = "Aucun cas dans ce module.";
    return;
  }
  const c = cases[Math.floor(Math.random() * cases.length)];
  box.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;">Question</div>
    <div style="opacity:.9">${c.q}</div>
    <button class="btn" style="margin-top:10px;" onclick="revealCaseAnswer(${JSON.stringify(c.a)})">Voir correction</button>
    <div id="caseAnswer" style="margin-top:10px; opacity:.9"></div>
  `;
}

function revealCaseAnswer(a) {
  document.getElementById("caseAnswer").innerHTML = `<b>Correction :</b><br>${a}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Sync ---
async function syncNow() {
  const status = document.getElementById("syncStatus");
  status.innerHTML = "⏳ Synchronisation...";

  try {
    const data = await fetchJSON("db_index.json");
    status.innerHTML = "✅ Sync OK (" + data.updated_at + ")";
    await loadModules();
  } catch (e) {
    status.innerHTML = "⚠️ Sync impossible — " + e.message;
  }
}

// --- Tutor offline minimal ---
function tutorAskOffline() {
  const q = (document.getElementById("tutorQ").value || "").toLowerCase();
  const out = document.getElementById("tutorA");
  if (!q) { out.innerHTML = "Pose une question."; return; }

  if (q.includes("tva")) out.innerHTML = "TVA: impôt indirect sur la consommation. Déduction si dépense pro + facture conforme + activité taxable.";
  else if (q.includes("isoc")) out.innerHTML = "ISOC: impôt des sociétés. Base imposable = résultat comptable ajusté (DNA, etc.).";
  else out.innerHTML = "Mode local: base minimale. On enrichit avec une grosse base par modules.";
}

window.addEventListener("load", () => {
  loadModules();
});