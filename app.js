const DB_URL = "./db/tva.json";

let DB = null;
let currentLessonIndex = 0;

async function loadDB() {
  try {
    console.log("📡 Fetch :", DB_URL);

    const res = await fetch(DB_URL + "?v=" + Date.now(), {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const data = await res.json();

    console.log("✅ DB reçue :", data);

    DB = data;

    document.getElementById("status").innerText =
      "✅ DB chargée : " + data.meta.title;

    document.getElementById("counts").innerText =
      `Cours: ${data.lessons.length} • QCM: ${data.qcm.length} • Cas: ${data.cases.length}`;

  } catch (err) {
    console.error("❌ ERREUR :", err);

    document.getElementById("status").innerText =
      "❌ ERREUR : " + err.message;
  }
}

function openFirstLesson() {
  if (!DB) {
    alert("DB non chargée");
    return;
  }

  currentLessonIndex = 0;
  renderLesson();
}

function renderLesson() {
  const lesson = DB.lessons[currentLessonIndex];

  document.getElementById("title").innerText = lesson.title;
  document.getElementById("level").innerText = lesson.level;
  document.getElementById("content").innerText = lesson.text;
}

function nextLesson() {
  if (currentLessonIndex < DB.lessons.length - 1) {
    currentLessonIndex++;
    renderLesson();
  }
}

function prevLesson() {
  if (currentLessonIndex > 0) {
    currentLessonIndex--;
    renderLesson();
  }
}

loadDB();