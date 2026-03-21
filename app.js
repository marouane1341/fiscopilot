const DB_URL = "./db/tva.json?v=" + Date.now();

let db = null;
let currentTab = "lessons";
let filteredItems = [];
let currentIndex = -1;

const $ = (selector) => document.querySelector(selector);

function setStatus(text, ok = true) {
  const el = $("#dbStatus");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "rgba(238,245,255,.72)" : "#ffb4b4";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getCurrentCollection() {
  if (!db) return [];
  if (currentTab === "lessons") return db.lessons || [];
  if (currentTab === "qcm") return db.qcm || [];
  return db.cases || [];
}

function updateCounts() {
  const lessons = db?.lessons?.length || 0;
  const qcm = db?.qcm?.length || 0;
  const cases = db?.cases?.length || 0;
  $("#counts").textContent = `Cours: ${lessons} • QCM: ${qcm} • Cas: ${cases}`;
}

function previewText(item) {
  if (currentTab === "lessons") return (item.text || "").slice(0, 180);
  if (currentTab === "qcm") return item.explain || "";
  return item.question || "";
}

function titleText(item) {
  if (currentTab === "lessons") return item.title || "Cours";
  if (currentTab === "qcm") return item.question || "QCM";
  return item.title || "Cas";
}

function metaText(item, index) {
  if (currentTab === "lessons") return `${item.level || "—"} • ${item.id || `cours_${index + 1}`}`;
  if (currentTab === "qcm") return `${item.level || "—"} • QCM ${index + 1}`;
  return `${item.level || "—"} • Cas ${index + 1}`;
}

function renderList() {
  const content = $("#contentArea");
  const q = normalize($("#searchInput").value);

  const source = getCurrentCollection();

  filteredItems = source.filter((item) => {
    const blob = normalize(JSON.stringify(item));
    return !q || blob.includes(q);
  });

  currentIndex = -1;
  $("#backToListBtn").classList.add("hidden");

  if (!filteredItems.length) {
    content.innerHTML = `
      <div class="detail-card">
        <div class="detail-title">Aucun résultat</div>
        <div class="detail-body">Ta recherche ne renvoie rien. Change de mot-clé ou de section.</div>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="list">
      ${filteredItems.map((item, index) => `
        <button class="list-item" data-index="${index}">
          <div class="item-title">${escapeHtml(titleText(item))}</div>
          <div class="item-meta">${escapeHtml(metaText(item, index))}</div>
          <div class="item-preview">${escapeHtml(previewText(item))}...</div>
        </button>
      `).join("")}
    </div>
  `;

  content.querySelectorAll(".list-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      openDetail(Number(btn.dataset.index));
    });
  });
}

function renderLesson(item) {
  return `
    <div class="detail-body">${escapeHtml(item.text || "")}</div>
  `;
}

function renderQcm(item) {
  const choices = item.choices || [];
  return `
    <div class="detail-body">${escapeHtml(item.question || "")}</div>
    <div class="nav-row">
      ${choices.map((choice, idx) => `
        <button class="btn btn-secondary qcm-choice" data-choice="${idx}">
          ${idx + 1}) ${escapeHtml(choice)}
        </button>
      `).join("")}
    </div>
    <div class="answer-box" id="answerBox" style="display:none;"></div>
  `;
}

function renderCase(item) {
  return `
    <div class="detail-body">${escapeHtml(item.question || "")}</div>
    <div class="answer-box" style="margin-top:16px;">
      <strong>Réponse</strong><br><br>
      ${escapeHtml(item.answer_md || "").replace(/\n/g, "<br>")}
    </div>
  `;
}

function openDetail(index) {
  currentIndex = index;
  const item = filteredItems[index];
  if (!item) return;

  $("#backToListBtn").classList.remove("hidden");

  const body =
    currentTab === "lessons"
      ? renderLesson(item)
      : currentTab === "qcm"
      ? renderQcm(item)
      : renderCase(item);

  $("#contentArea").innerHTML = `
    <div class="detail-card">
      <div class="detail-title">${escapeHtml(titleText(item))}</div>
      <div class="badge">${escapeHtml(metaText(item, index))}</div>
      ${body}
      <div class="nav-row">
        <button class="btn btn-secondary" id="prevBtn">◀ Précédent</button>
        <button class="btn btn-secondary" id="nextBtn">Suivant ▶</button>
      </div>
    </div>
  `;

  $("#prevBtn").addEventListener("click", () => stepDetail(-1));
  $("#nextBtn").addEventListener("click", () => stepDetail(1));

  if (currentTab === "qcm") {
    document.querySelectorAll("[data-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const selected = Number(btn.dataset.choice);
        const isCorrect = selected === Number(item.answer);
        const box = $("#answerBox");
        box.style.display = "block";
        box.innerHTML = `
          <strong>${isCorrect ? "✅ Bonne réponse" : "❌ Mauvaise réponse"}</strong><br><br>
          ${escapeHtml(item.explain || "")}
        `;
      });
    });
  }
}

function stepDetail(delta) {
  if (!filteredItems.length) return;
  let next = currentIndex + delta;
  if (next < 0) next = filteredItems.length - 1;
  if (next >= filteredItems.length) next = 0;
  openDetail(next);
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  renderList();
}

function openRandom() {
  if (!filteredItems.length) return;
  const randomIndex = Math.floor(Math.random() * filteredItems.length);
  openDetail(randomIndex);
}

function openFirst() {
  if (!filteredItems.length) return;
  openDetail(0);
}

async function loadDb() {
  try {
    setStatus("Chargement de la base…");
    const res = await fetch(DB_URL, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!data || !Array.isArray(data.lessons) || !Array.isArray(data.qcm) || !Array.isArray(data.cases)) {
      throw new Error("Format de base invalide");
    }

    db = data;
    updateCounts();
    setStatus(`Base chargée : ${db.meta?.title || "TVA Belgique"} • v${db.meta?.version || "?"}`);
    renderList();
  } catch (err) {
    console.error(err);
    setStatus(`Erreur DB : ${err.message}`, false);
    $("#contentArea").innerHTML = `
      <div class="detail-card">
        <div class="detail-title">Erreur de chargement</div>
        <div class="detail-body">
La base n’a pas pu être chargée.

Vérifie :
- que le fichier existe bien dans /db/tva.json
- que GitHub Pages sert bien la dernière version
- que tu n’as pas un ancien cache navigateur
        </div>
      </div>
    `;
  }
}

function init() {
  $("#reloadBtn").addEventListener("click", loadDb);
  $("#randomBtn").addEventListener("click", openRandom);
  $("#backToListBtn").addEventListener("click", renderList);
  $("#openFirstBtn").addEventListener("click", openFirst);
  $("#searchInput").addEventListener("input", renderList);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  $("#netStatus").textContent = navigator.onLine ? "En ligne" : "Hors ligne";

  loadDb();
}

window.addEventListener("load", init);