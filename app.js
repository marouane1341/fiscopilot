/* ===============================
   FISCOPILOT APP STABLE (GitHub Pages)
   - charge db/tva.json
   - anti-cache (PWA)
   - navigation cours
   - recherche simple
   - audio optionnel via worker
   =============================== */

// ⚠️ Ton JSON est dans db/tva.json
const DB_URL = "db/tva.json?v=" + Date.now(); // anti cache fort

// 🔊 OPTIONNEL : colle ici ton worker (sinon audio désactivé)
const AUDIO_WORKER_URL = ""; 
// Exemple :
// const AUDIO_WORKER_URL = "https://elevenapikey.marouane1341.workers.dev/";

let DB = null;
let currentLessonIndex = 0;

// -------------------------
// DOM helpers
// -------------------------
const $ = (id) => document.getElementById(id);

function setOnlinePill() {
  const pill = $("statusPill");
  if (!pill) return;
  const online = navigator.onLine;
  pill.textContent = online ? "En ligne" : "Hors ligne";
}

// -------------------------
// Pages
// -------------------------
function showPage(pageId) {
  const pages = ["pageModules", "pageLesson"];
  pages.forEach((p) => {
    const el = $(p);
    if (!el) return;
    el.classList.toggle("active", p === pageId);
  });
}

// -------------------------
// Load DB
// -------------------------
async function loadDB() {
  try {
    setOnlinePill();

    const res = await fetch(DB_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);

    DB = await res.json();

    // UI counts
    const lessons = DB.lessons || [];
    const qcm = DB.qcm || [];
    const cases = DB.cases || [];

    if ($("moduleCounts")) {
      $("moduleCounts").textContent = `Cours: ${lessons.length} • QCM: ${qcm.length} • Cas: ${cases.length}`;
    }

    if ($("sourcesCount")) {
      $("sourcesCount").textContent = "1"; // ton tva.json = 1 source module
    }

    if ($("dbHint")) {
      $("dbHint").textContent = `✅ DB chargée: "${DB?.meta?.title || "TVA"}" • v${DB?.meta?.version ?? "?"}`;
    }

  } catch (e) {
    console.error("Erreur DB ❌", e);
    if ($("dbHint")) {
      $("dbHint").textContent = "❌ Impossible de charger db/tva.json (vérifie le chemin /db/tva.json et GitHub Pages).";
    }
    alert("Impossible de charger db/tva.json");
  }
}

// -------------------------
// Lesson render
// -------------------------
function renderLesson(index) {
  if (!DB?.lessons?.length) return;

  const lesson = DB.lessons[index];
  if (!lesson) return;

  currentLessonIndex = index;

  if ($("lessonTitle")) $("lessonTitle").textContent = lesson.title || "Cours";
  if ($("lessonLevel")) $("lessonLevel").textContent = lesson.level || "";
  if ($("lessonContent")) $("lessonContent").textContent = lesson.text || "";

  // info audio
  if ($("audioInfo")) {
    $("audioInfo").textContent = AUDIO_WORKER_URL
      ? "Audio prêt ✅ (bouton Audio)"
      : "Audio: prêt (il manque juste l’URL du worker).";
  }
}

// -------------------------
// Navigation cours
// -------------------------
function nextLesson() {
  if (!DB?.lessons?.length) return;
  if (currentLessonIndex < DB.lessons.length - 1) {
    renderLesson(currentLessonIndex + 1);
  }
}

function prevLesson() {
  if (!DB?.lessons?.length) return;
  if (currentLessonIndex > 0) {
    renderLesson(currentLessonIndex - 1);
  }
}

// -------------------------
// Random
// -------------------------
function randomLesson() {
  if (!DB?.lessons?.length) return;
  const index = Math.floor(Math.random() * DB.lessons.length);
  openLesson(index);
}

// -------------------------
// Open lesson
// -------------------------
function openLesson(index) {
  showPage("pageLesson");
  renderLesson(index);
}

// -------------------------
// Search (simple)
// -------------------------
function searchLessons(query) {
  if (!DB?.lessons?.length) return null;
  const q = (query || "").trim().toLowerCase();
  if (!q) return null;

  // cherche dans title + text + id
  const idx = DB.lessons.findIndex((l) => {
    const hay = `${l.id || ""} ${l.title || ""} ${l.text || ""}`.toLowerCase();
    return hay.includes(q);
  });

  return idx >= 0 ? idx : null;
}

// -------------------------
// Audio via worker
// -------------------------
async function playAudioFromWorker(text) {
  if (!AUDIO_WORKER_URL) {
    alert("Audio pas branché: ajoute l’URL du worker dans app.js (AUDIO_WORKER_URL).");
    return;
  }

  try {
    const res = await fetch(AUDIO_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("Audio HTTP error", res.status, t);
      alert("Erreur audio (worker).");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    try { await audio.play(); } catch (_) {}
  } catch (err) {
    console.error(err);
    alert("Erreur réseau audio.");
  }
}

// -------------------------
// Bind events
// -------------------------
function bindUI() {
  // online / offline
  window.addEventListener("online", setOnlinePill);
  window.addEventListener("offline", setOnlinePill);

  // boutons modules
  if ($("openFirstLessonBtn")) {
    $("openFirstLessonBtn").addEventListener("click", () => {
      if (!DB?.lessons?.length) return alert("DB non chargée.");
      openLesson(0);
    });
  }

  if ($("randomBtn")) {
    $("randomBtn").addEventListener("click", randomLesson);
  }

  if ($("searchInput")) {
    $("searchInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const idx = searchLessons(e.target.value);
        if (idx === null) alert("Aucun résultat.");
        else openLesson(idx);
      }
    });
  }

  // nav lesson
  if ($("backBtn")) $("backBtn").addEventListener("click", () => showPage("pageModules"));
  if ($("nextBtn")) $("nextBtn").addEventListener("click", nextLesson);
  if ($("prevBtn")) $("prevBtn").addEventListener("click", prevLesson);

  if ($("audioBtn")) {
    $("audioBtn").addEventListener("click", () => {
      if (!DB?.lessons?.length) return;
      const lesson = DB.lessons[currentLessonIndex];
      const txt = `${lesson.title}\n\n${lesson.text}`;
      playAudioFromWorker(txt);
    });
  }

  // tabs (juste UI)
  const tabs = [
    { id: "btnCours" },
    { id: "btnQcm" },
    { id: "btnCas" }
  ];
  tabs.forEach((t) => {
    const el = $(t.id);
    if (!el) return;
    el.addEventListener("click", () => {
      tabs.forEach((x) => $(x.id)?.classList.remove("active"));
      el.classList.add("active");
      // pour l’instant on garde simple (cours)
      if (t.id === "btnQcm") alert("QCM bientôt (prochaine étape).");
      if (t.id === "btnCas") alert("Cas bientôt (prochaine étape).");
    });
  });
}

// -------------------------
// Init
// -------------------------
window.addEventListener("load", async () => {
  bindUI();
  await loadDB();
  setOnlinePill();
  showPage("pageModules");
});