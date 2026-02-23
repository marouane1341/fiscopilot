// ===============================
// FiscoPilot AI ELITE MAX - STABLE
// ===============================

const SOURCES = [
  "./db/tva.json",
  "./db/tva_1_fondations.json",
  "./db/tva_2_pratique.json",
  "./db/tva_3_expert.json",
];

// Si tu as un Worker audio, tu mettras l’URL ici plus tard
// Exemple: "https://elevenapikey.marouane1341.workers.dev/"
const AUDIO_WORKER_URL = ""; // <- laisse vide pour l’instant

const $ = (id) => document.getElementById(id);

const state = {
  tab: "cours",             // "cours" | "qcm" | "cas"
  all: { cours: [], qcm: [], cas: [] },
  filtered: [],
  reader: { list: [], index: 0, type: "cours" },
};

function setOnlinePill() {
  const btn = $("btnOnline");
  if (!btn) return;
  const ok = navigator.onLine;
  btn.textContent = ok ? "En ligne" : "Hors ligne";
  btn.style.background = ok ? "rgba(34,197,94,.14)" : "rgba(239,68,68,.18)";
}

window.addEventListener("online", setOnlinePill);
window.addEventListener("offline", setOnlinePill);

// ------------------------------
// Load & normalize
// ------------------------------

async function loadAll() {
  setOnlinePill();
  $("list").innerHTML = "";
  $("empty").classList.add("hidden");
  $("srcInfo").textContent = "Sources: chargement...";

  const merged = { cours: [], qcm: [], cas: [] };

  for (const url of SOURCES) {
    try {
      const res = await fetch(url + "?v=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);

      const json = await res.json();

      // Support "lessons" (cours), "qcm", "cases"
      if (Array.isArray(json.lessons)) merged.cours.push(...json.lessons.map(x => ({...x, __src:url})));
      if (Array.isArray(json.qcm)) merged.qcm.push(...json.qcm.map(x => ({...x, __src:url})));
      if (Array.isArray(json.cases)) merged.cas.push(...json.cases.map(x => ({...x, __src:url})));

      // Support éventuel "modules" si tu en as dans un autre format
      if (Array.isArray(json.modules)) merged.cours.push(...json.modules.map(x => ({...x, __src:url})));

    } catch (e) {
      console.error("❌ JSON load fail", url, e);
    }
  }

  state.all = merged;

  $("srcInfo").textContent = `Sources: ${SOURCES.length}`;
  updateCounts();
  applyFilterAndRender();
}

function updateCounts() {
  const c = state.all.cours.length;
  const q = state.all.qcm.length;
  const k = state.all.cas.length;
  $("counts").textContent = `Cours: ${c} • QCM: ${q} • Cas: ${k}`;
}

// ------------------------------
// Tabs + search + random
// ------------------------------

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  $("searchInput").value = "";
  applyFilterAndRender();
}

function getTabList() {
  if (state.tab === "qcm") return state.all.qcm;
  if (state.tab === "cas") return state.all.cas;
  return state.all.cours;
}

function normalizeText(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function applyFilterAndRender() {
  const q = normalizeText($("searchInput").value.trim());
  const list = getTabList();

  const filtered = !q ? list : list.filter(item => {
    const hay = normalizeText(
      (item.title || "") + " " +
      (item.question || "") + " " +
      (item.text || "") + " " +
      JSON.stringify(item.choices || [])
    );
    return hay.includes(q);
  });

  state.filtered = filtered;
  renderList();
}

function renderList() {
  const listEl = $("list");
  const emptyEl = $("empty");
  listEl.innerHTML = "";

  if (!state.filtered.length) {
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  state.filtered.slice(0, 200).forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = "item";

    const title = (state.tab === "qcm")
      ? (item.question || "QCM")
      : (item.title || "Sans titre");

    const meta = [
      item.level ? `Niveau: ${item.level}` : null,
      item.id ? `ID: ${item.id}` : null
    ].filter(Boolean).join(" • ");

    const preview =
      state.tab === "qcm"
        ? (Array.isArray(item.choices) ? "Choix: " + item.choices.join(" | ") : "")
        : (item.text || "").slice(0, 150);

    div.innerHTML = `
      <div class="itemTop">
        <div class="itemTitle">${escapeHtml(title)}</div>
        <div class="itemMeta">${escapeHtml(meta)}</div>
      </div>
      <div class="itemText">${escapeHtml(preview)}${preview.length >= 150 ? "..." : ""}</div>
    `;

    div.addEventListener("click", () => openReaderFromFiltered(idx));
    listEl.appendChild(div);
  });
}

function openRandom() {
  if (!state.filtered.length) return;
  const i = Math.floor(Math.random() * state.filtered.length);
  openReaderFromFiltered(i);
}

// ------------------------------
// Reader (Cours / QCM / Cas)
// ------------------------------

function openReaderFromFiltered(filteredIndex) {
  state.reader.list = state.filtered;
  state.reader.index = filteredIndex;
  state.reader.type = state.tab;

  showView("reader");
  renderReader();
}

function renderReader() {
  const { list, index, type } = state.reader;
  const total = list.length;
  const item = list[index];
  if (!item) return;

  $("readerIndex").textContent = `${index + 1}/${total}`;
  $("readerLevel").textContent = item.level ? item.level : (type.toUpperCase());

  if (type === "qcm") {
    $("readerTitle").textContent = item.question || "QCM";
    const choices = Array.isArray(item.choices) ? item.choices : [];
    const answerIndex = typeof item.answer === "number" ? item.answer : null;
    const explain = item.explain || "";

    const body =
      `CHOISISSEZ\n\n` +
      choices.map((c, i) => `${i + 1}) ${c}`).join("\n") +
      `\n\nRÉPONSE\n${answerIndex !== null ? (answerIndex + 1) : "—"}\n\nEXPLICATION\n${explain}`;

    $("readerBody").textContent = body;

  } else if (type === "cas") {
    $("readerTitle").textContent = item.title || "Cas";
    $("readerBody").textContent =
      (item.text || "") +
      (item.expected ? `\n\nATTENDU\n${item.expected}` : "") +
      (item.answer ? `\n\nSOLUTION\n${item.answer}` : "");
  } else {
    $("readerTitle").textContent = item.title || "Cours";
    $("readerBody").textContent =
      (item.objective ? `OBJECTIF\n${item.objective}\n\n` : "") +
      (item.text ? `EXPLICATION\n${item.text}` : "");
  }

  // Audio hint
  if (!AUDIO_WORKER_URL) {
    $("readerHint").classList.remove("hidden");
    $("readerHint").textContent =
      "Audio: prêt (il manque juste l’URL du worker).";
  } else {
    $("readerHint").classList.add("hidden");
  }
}

function prevItem() {
  if (state.reader.index > 0) {
    state.reader.index--;
    renderReader();
  }
}

function nextItem() {
  if (state.reader.index < state.reader.list.length - 1) {
    state.reader.index++;
    renderReader();
  }
}

function showView(which) {
  const home = $("homeView");
  const reader = $("readerView");
  if (which === "reader") {
    home.classList.add("hidden");
    reader.classList.remove("hidden");
  } else {
    reader.classList.add("hidden");
    home.classList.remove("hidden");
  }
}

// ------------------------------
// Audio (optionnel)
// ------------------------------

async function playAudio() {
  if (!AUDIO_WORKER_URL) {
    alert("Audio pas branché: ajoute l’URL du worker dans app.js (AUDIO_WORKER_URL).");
    return;
  }

  const text = $("readerBody").textContent || $("readerTitle").textContent || "";
  if (!text.trim()) return;

  try {
    const res = await fetch(AUDIO_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`HTTP ${res.status} - ${t.slice(0, 180)}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await audio.play().catch(()=>{});
  } catch (e) {
    console.error(e);
    alert("Erreur audio: " + (e?.message || e));
  }
}

// ------------------------------
// Helpers
// ------------------------------

function escapeHtml(str) {
  return (str || "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------------
// Events
// ------------------------------

window.addEventListener("load", () => {
  // tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  // search
  $("searchInput").addEventListener("input", applyFilterAndRender);

  // random
  $("btnRandom").addEventListener("click", openRandom);

  // reader nav
  $("btnBack").addEventListener("click", () => showView("home"));
  $("btnPrev").addEventListener("click", prevItem);
  $("btnNext").addEventListener("click", nextItem);
  $("btnAudio").addEventListener("click", playAudio);

  // start
  loadAll();
});