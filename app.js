const DB_URL = "db/tva.json?v=" + Date.now();

let DB = null;
let currentIndex = 0;
let currentMode = "lessons";

// ELEMENTS
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const titleEl = document.getElementById("title");
const levelEl = document.getElementById("level");
const contentEl = document.getElementById("content");

// LOAD DB
async function loadDB() {
  try {
    statusEl.textContent = "Chargement de la base...";

    const res = await fetch(DB_URL);
    const data = await res.json();

    DB = data;

    console.log("DB chargée:", DB);

    updateCounts();

    statusEl.textContent =
      "✅ DB chargée : " + DB.meta.title + " • v" + DB.meta.version;

  } catch (err) {
    statusEl.textContent = "❌ Erreur chargement DB";
    console.error(err);
  }
}

// COUNTS
function updateCounts() {
  countEl.textContent =
    "Cours: " + DB.lessons.length +
    " • QCM: " + DB.qcm.length +
    " • Cas: " + DB.cases.length;
}

// SHOW ITEM
function showItem() {
  let item;

  if (currentMode === "lessons") {
    item = DB.lessons[currentIndex];
    titleEl.textContent = item.title;
    levelEl.textContent = item.level;
    contentEl.textContent = item.text;
  }

  if (currentMode === "qcm") {
    item = DB.qcm[currentIndex];
    titleEl.textContent = item.question;
    levelEl.textContent = item.level;
    contentEl.textContent = item.choices.join("\n");
  }

  if (currentMode === "cases") {
    item = DB.cases[currentIndex];
    titleEl.textContent = item.title;
    levelEl.textContent = item.level;
    contentEl.textContent = item.question + "\n\n" + item.answer_md;
  }
}

// NAVIGATION
function next() {
  const list = DB[currentMode];
  currentIndex = (currentIndex + 1) % list.length;
  showItem();
}

function prev() {
  const list = DB[currentMode];
  currentIndex =
    (currentIndex - 1 + list.length) % list.length;
  showItem();
}

// MODE SWITCH
function setMode(mode) {
  currentMode = mode;
  currentIndex = 0;
  showItem();
}

// BUTTONS
document.getElementById("btnCours").onclick = () => setMode("lessons");
document.getElementById("btnQcm").onclick = () => setMode("qcm");
document.getElementById("btnCas").onclick = () => setMode("cases");

document.getElementById("btnNext").onclick = next;
document.getElementById("btnPrev").onclick = prev;

document.getElementById("btnStart").onclick = () => {
  currentIndex = 0;
  showItem();
};

// INIT
loadDB();