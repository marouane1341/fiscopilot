// =============================
// CONFIG
// =============================

const DB_URL = "./tva.json";
const AUDIO_WORKER_URL = "https://apikey.marouane1341.workers.dev/tts";

let db = null;
let lessons = [];
let currentIndex = 0;


// =============================
// LOAD DB
// =============================

async function loadDB() {
  try {
    const res = await fetch(DB_URL);
    db = await res.json();

    lessons = db.lessons || [];

    document.getElementById("dbStatus").innerText =
      `✅ DB chargée: "${db.meta.title}" • v${db.meta.version}`;

    document.getElementById("counts").innerText =
      `Cours: ${lessons.length} • QCM: ${db.qcm.length} • Cas: ${db.cases.length}`;

  } catch (err) {
    console.error(err);
    alert("Erreur chargement DB");
  }
}


// =============================
// OPEN FIRST COURSE
// =============================

function openFirstLesson() {
  if (!lessons.length) return;
  currentIndex = 0;
  showLesson();
}


// =============================
// DISPLAY LESSON
// =============================

function showLesson() {
  const lesson = lessons[currentIndex];

  document.getElementById("title").innerText = lesson.title;
  document.getElementById("level").innerText = lesson.level;
  document.getElementById("content").innerText = lesson.text;
}


// =============================
// NAVIGATION
// =============================

function nextLesson() {
  if (currentIndex < lessons.length - 1) {
    currentIndex++;
    showLesson();
  }
}

function prevLesson() {
  if (currentIndex > 0) {
    currentIndex--;
    showLesson();
  }
}


// =============================
// AUDIO
// =============================

async function playAudio() {

  const lesson = lessons[currentIndex];

  if (!lesson) return;

  try {

    const res = await fetch(AUDIO_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: lesson.text
      })
    });

    if (!res.ok) {
      throw new Error("Worker error");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audio.play();

  } catch (err) {
    console.error(err);
    alert("Erreur audio");
  }
}


// =============================
// INIT
// =============================

window.onload = loadDB;
