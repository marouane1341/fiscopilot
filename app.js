/* =========================
   FiscoPilot — app.js (STABLE)
   Build: 38
   - no null onclick crash
   - stable modal navigation
   - offline speechSynthesis TTS if available
========================= */

const APP_BUILD = 38; // <- incrémente quand tu changes JS/JSON

// ---------- Utils ----------
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toast(msg, ms = 2200) {
  let t = $("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
    t.style.position = "fixed";
    t.style.left = "50%";
    t.style.bottom = "18px";
    t.style.transform = "translateX(-50%)";
    t.style.padding = "10px 14px";
    t.style.borderRadius = "14px";
    t.style.background = "rgba(0,0,0,0.65)";
    t.style.border = "1px solid rgba(255,255,255,0.12)";
    t.style.color = "white";
    t.style.zIndex = "9999";
    t.style.fontWeight = "600";
    t.style.fontSize = "14px";
    t.style.maxWidth = "90vw";
    t.style.textAlign = "center";
    t.style.backdropFilter = "blur(10px)";
    t.style.display = "none";
  }
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => (t.style.display = "none"), ms);
}

function safeOn(el, evt, fn) {
  if (!el) return;
  el.addEventListener(evt, fn, { passive: true });
}

function setNetPill(online) {
  const pill = $("netPill");
  if (!pill) return;
  pill.textContent = online ? "En ligne" : "Hors ligne";
  pill.classList.toggle("online", !!online);
  pill.classList.toggle("offline", !online);
}

function setBuildNum() {
  const bn = $("buildNum");
  if (bn) bn.textContent = String(APP_BUILD);
}

// Strip text for TTS
function toPlainText(htmlOrText) {
  const div = document.createElement("div");
  div.innerHTML = String(htmlOrText || "");
  const txt = (div.textContent || div.innerText || "").trim();
  // limiter pour éviter crash Android sur textes énormes
  return txt.length > 12000 ? txt.slice(0, 12000) + "…" : txt;
}

// ---------- Service worker ----------
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("sw.js");
  } catch (e) {
    // pas bloquant
    console.warn("SW register failed", e);
  }
}

// ---------- Data loading ----------
async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.json();
}

function normalizeCourse(item) {
  // Supporte plusieurs formats possibles
  const title = item.title || item.titre || "Cours";
  const level = item.level || item.niveau || "Débutant";
  const module = item.module || item.moduleTitle || item.mod || "TVA Belgique";

  // Nouveau format "premium blocks"
  const blocks = item.blocks || item.contenu || null;

  // Format simple
  const objective = item.objective || item.obj || item.OBJECTIF || "";
  const explanation = item.explanation || item.explication || item.EXPLICATION || "";
  const method = item.method || item.methode || item["MÉTHODE"] || item["MÉTHODE CABINET"] || "";
  const example = item.example || item.exemple || item.EXEMPLE || "";
  const remember = item.remember || item.retenir || item["À RETENIR"] || "";

  return {
    id: item.id || item._id || crypto.randomUUID?.() || String(Math.random()),
    type: "course",
    title,
    level,
    module,
    premium: item.premium ?? true,
    blocks,
    objective,
    explanation,
    method,
    example,
    remember,
    tags: item.tags || [],
  };
}

function normalizeQcm(item) {
  return {
    id: item.id || crypto.randomUUID?.() || String(Math.random()),
    type: "qcm",
    question: item.question || item.q || "Question",
    choices: item.choices || item.reponses || item.options || [],
    answer: item.answer ?? item.correct ?? 0,
    explain: item.explain || item.explication || "",
    level: item.level || "Débutant",
  };
}

function normalizeCase(item) {
  return {
    id: item.id || crypto.randomUUID?.() || String(Math.random()),
    type: "case",
    title: item.title || item.titre || "Cas",
    statement: item.statement || item.enonce || "",
    solution: item.solution || item.corrige || "",
    level: item.level || "Débutant",
  };
}

async function loadModulePack(moduleDef) {
  const pack = { courses: [], qcm: [], cases: [] };

  for (const src of moduleDef.sources || []) {
    try {
      const data = await fetchJSON(src);

      // formats acceptés:
      // { courses:[...], qcm:[...], cases:[...] }
      // ou un tableau direct
      if (Array.isArray(data)) {
        // devine type
        for (const it of data) {
          if (it.question || it.choices) pack.qcm.push(normalizeQcm(it));
          else if (it.statement || it.solution) pack.cases.push(normalizeCase(it));
          else pack.courses.push(normalizeCourse(it));
        }
      } else {
        const c = data.courses || data.cours || [];
        const q = data.qcm || data.questions || [];
        const k = data.cases || data.cas || [];
        c.forEach((it) => pack.courses.push(normalizeCourse(it)));
        q.forEach((it) => pack.qcm.push(normalizeQcm(it)));
        k.forEach((it) => pack.cases.push(normalizeCase(it)));
      }
    } catch (e) {
      console.warn("Load source failed:", src, e);
      toast(`Source HS: ${src}`, 1800);
    }
  }

  // tri stable
  pack.courses.sort((a, b) => a.title.localeCompare(b.title));
  return pack;
}

// ---------- UI State ----------
const state = {
  view: "modules", // modules | module
  modules: [],
  activeModule: null,
  pack: null,
  tab: "cours", // cours | qcm | cas
  query: "",
  modalOpen: false,
  modalIndex: 0,
  modalList: [],
  ttsEnabled: true,
  ttsSpeaking: false,
  ttsVoice: null,
};

// ---------- DOM root ----------
const appRoot = () => $("app");

// ---------- Drawer ----------
function openDrawer() {
  const d = $("drawer");
  if (!d) return;
  d.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  const d = $("drawer");
  if (!d) return;
  d.setAttribute("aria-hidden", "true");
}

// ---------- Modal ----------
function openModal(list, idx) {
  state.modalList = list || [];
  state.modalIndex = Math.max(0, Math.min(idx || 0, state.modalList.length - 1));

  const m = $("modal");
  const body = $("modalBody");
  const lvl = $("modalLevel");
  const pos = $("modalPos");

  if (!m || !body) return;

  document.documentElement.classList.add("modalOpen");
  document.body.classList.add("modalOpen");

  m.setAttribute("aria-hidden", "false");
  state.modalOpen = true;

  renderModal();
  if (lvl) lvl.textContent = state.modalList[state.modalIndex]?.level || "Niveau";
  if (pos) pos.textContent = `${state.modalIndex + 1}/${state.modalList.length}`;
}

function closeModal() {
  const m = $("modal");
  if (!m) return;

  stopTTS();

  m.setAttribute("aria-hidden", "true");
  state.modalOpen = false;

  document.documentElement.classList.remove("modalOpen");
  document.body.classList.remove("modalOpen");
}

function modalPrev() {
  if (!state.modalOpen) return;
  if (state.modalIndex > 0) {
    state.modalIndex--;
    stopTTS();
    renderModal();
  } else {
    toast("Déjà au début");
  }
}
function modalNext() {
  if (!state.modalOpen) return;
  if (state.modalIndex < state.modalList.length - 1) {
    state.modalIndex++;
    stopTTS();
    renderModal();
  } else {
    toast("Fin de liste");
  }
}

// ---------- TTS (speechSynthesis OFFLINE) ----------
function supportsTTS() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function pickFrenchVoice() {
  if (!supportsTTS()) return null;
  const voices = speechSynthesis.getVoices?.() || [];
  // priorité: fr-BE > fr-FR > fr
  const frBE = voices.find(v => /fr[-_]?BE/i.test(v.lang));
  const frFR = voices.find(v => /fr[-_]?FR/i.test(v.lang));
  const frAny = voices.find(v => /^fr/i.test(v.lang));
  return frBE || frFR || frAny || voices[0] || null;
}

function stopTTS() {
  if (!supportsTTS()) return;
  try {
    speechSynthesis.cancel();
  } catch {}
  state.ttsSpeaking = false;
}

function speakCurrent() {
  if (!supportsTTS()) {
    toast("Audio indisponible sur cet appareil.");
    return;
  }
  const item = state.modalList[state.modalIndex];
  if (!item) return;

  // Certains Android n'ont aucune voix offline
  const voice = state.ttsVoice || pickFrenchVoice();
  state.ttsVoice = voice;

  if (!voice) {
    toast("Aucune voix installée (TTS). Active Google Speech / voix FR.");
    return;
  }

  // texte à lire: titre + contenu
  const txt = buildCourseTextForTTS(item);
  if (!txt) {
    toast("Rien à lire.");
    return;
  }

  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = voice.lang || "fr-FR";
    u.voice = voice;

    // réglages naturels
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;

    u.onend = () => { state.ttsSpeaking = false; toast("Lecture terminée"); };
    u.onerror = () => { state.ttsSpeaking = false; toast("Erreur audio (TTS)"); };

    state.ttsSpeaking = true;
    speechSynthesis.speak(u);
    toast("Lecture audio…");
  } catch (e) {
    console.warn(e);
    state.ttsSpeaking = false;
    toast("Erreur audio (TTS)");
  }
}

function buildCourseTextForTTS(item) {
  // supporte cours + cas + qcm (lecture simple)
  if (item.type === "qcm") {
    const q = item.question || "";
    const ch = (item.choices || []).map((c, i) => `${i + 1}. ${c}`).join(" ");
    return toPlainText(`Question. ${q}. Choix: ${ch}.`);
  }
  if (item.type === "case") {
    return toPlainText(`${item.title}. Énoncé: ${item.statement}.`);
  }

  // cours premium
  const parts = [];
  parts.push(item.title || "Cours");

  if (item.objective) parts.push("Objectif. " + item.objective);
  if (item.explanation) parts.push("Explication. " + item.explanation);
  if (item.method) parts.push("Méthode cabinet. " + item.method);
  if (item.example) parts.push("Exemple. " + item.example);
  if (item.remember) parts.push("À retenir. " + item.remember);

  // Si blocks existent (format moderne)
  if (item.blocks && typeof item.blocks === "object") {
    const order = ["OBJECTIF","EXPLICATION","MÉTHODE CABINET","EXEMPLE","À RETENIR"];
    for (const k of order) {
      if (item.blocks[k]) parts.push(`${k}. ${item.blocks[k]}`);
    }
  }

  return toPlainText(parts.join("\n\n"));
}

// ---------- Render modules ----------
function renderModules() {
  const root = appRoot();
  if (!root) return;

  root.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="h2">Modules</div>
        <div class="muted" style="margin-top:6px">
          Choisis un module. Les cours premium ont objectif, méthode, exemple, “à retenir”.
        </div>
      </div>

      ${state.modules.map(m => `
        <div class="card">
          <div class="row between">
            <div>
              <div class="h2">📚 ${m.title}</div>
              <div class="muted" style="margin-top:6px">
                Sources: ${(m.sources||[]).join(", ")}
              </div>
            </div>
            <button class="btn primary" data-open-module="${m.id}">Ouvrir</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ---------- Render module view ----------
function renderModule() {
  const root = appRoot();
  if (!root || !state.activeModule || !state.pack) return;

  const { courses, qcm, cases } = state.pack;
  const countCours = courses.length;
  const countQcm = qcm.length;
  const countCas = cases.length;

  const list = getActiveList();
  const filtered = filterList(list);

  root.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="h2">📘 ${state.activeModule.title}</div>
        <div class="muted" style="margin-top:6px">
          Cours: ${countCours} • QCM: ${countQcm} • Cas: ${countCas}
        </div>

        <div style="margin-top:12px" class="tabs">
          <button class="tab ${state.tab==="cours"?"active":""}" data-tab="cours">📘 Cours</button>
          <button class="tab ${state.tab==="qcm"?"active":""}" data-tab="qcm">🧪 QCM</button>
          <button class="tab ${state.tab==="cas"?"active":""}" data-tab="cas">🧾 Cas</button>
        </div>

        <div class="row gap" style="margin-top:12px">
          <input class="input" id="searchBox" placeholder="Rechercher (ex: prorata, facture…)" value="${escapeHtml(state.query)}" />
          <button class="btn primary" data-random="1">Aléatoire</button>
        </div>
      </div>

      ${filtered.map((it, idx) => renderCardItem(it, idx)).join("")}

      ${filtered.length === 0 ? `
        <div class="card">
          <div class="muted">Aucun résultat.</div>
        </div>
      ` : ``}
    </div>
  `;
}

function renderCardItem(it, idx) {
  // extrait preview
  let preview = "";
  if (it.type === "qcm") preview = `Question: ${it.question}`;
  else if (it.type === "case") preview = `Énoncé: ${it.statement}`;
  else {
    preview = it.explanation || it.EXPLICATION || "";
    if (!preview && it.blocks) preview = it.blocks["EXPLICATION"] || "";
    if (!preview) preview = it.objective || "";
  }
  preview = toPlainText(preview).slice(0, 190);

  const badge = (lvl) => {
    const l = (lvl || "").toLowerCase();
    if (l.includes("expert")) return "🔴 Expert";
    if (l.includes("avancé") || l.includes("avance")) return "🟠 Avancé";
    if (l.includes("inter")) return "🟡 Intermédiaire";
    return "🟢 Débutant";
  };

  return `
    <div class="card">
      <div class="row between">
        <div style="padding-right:12px">
          <div class="h2">${escapeHtml(it.title || it.question || it.title || "Item")}</div>
          <div class="row gap" style="margin-top:10px; flex-wrap:wrap">
            <div class="pill">${badge(it.level)}</div>
            <div class="pill">📌 ${escapeHtml(it.module || state.activeModule.title)}</div>
            ${it.type === "course" ? `<div class="pill">📍 Cours premium</div>` : ``}
          </div>
          <div class="muted" style="margin-top:12px">${escapeHtml(preview)}${preview.length>=190?"…":""}</div>
        </div>
        <button class="btn ghost" data-open-item="${idx}">Ouvrir</button>
      </div>
    </div>
  `;
}

// ---------- Modal render ----------
function renderModal() {
  const item = state.modalList[state.modalIndex];
  const body = $("modalBody");
  const lvl = $("modalLevel");
  const pos = $("modalPos");
  if (!item || !body) return;

  if (lvl) lvl.textContent = item.level || "Niveau";
  if (pos) pos.textContent = `${state.modalIndex + 1}/${state.modalList.length}`;

  // Injecter un bouton audio dans la barre du modal (si pas déjà)
  ensureModalAudioButton();

  if (item.type === "qcm") {
    body.innerHTML = `
      <div class="modalTitle">${escapeHtml(item.question)}</div>

      <div class="block">
        <div class="blockTitle">CHOISISSEZ</div>
        <div class="blockBody">
          ${(item.choices||[]).map((c, i) => `
            <button class="choice" data-qcm-choice="${i}">
              ${i+1}) ${escapeHtml(c)}
            </button>
          `).join("")}
        </div>
      </div>

      ${item.explain ? `
        <div class="block">
          <div class="blockTitle">EXPLICATION</div>
          <div class="blockBody">${escapeHtml(item.explain)}</div>
        </div>
      ` : ``}
    `;
    return;
  }

  if (item.type === "case") {
    body.innerHTML = `
      <div class="modalTitle">${escapeHtml(item.title)}</div>

      <div class="block">
        <div class="blockTitle">ÉNONCÉ</div>
        <div class="blockBody">${escapeHtml(item.statement)}</div>
      </div>

      ${item.solution ? `
        <div class="block">
          <div class="blockTitle">CORRIGÉ</div>
          <div class="blockBody mono"><pre class="pre">${escapeHtml(item.solution)}</pre></div>
        </div>
      ` : ``}
    `;
    return;
  }

  // Cours premium : blocks si présents sinon champs simples
  const blocks = item.blocks && typeof item.blocks === "object" ? item.blocks : null;

  const objective = blocks?.["OBJECTIF"] || item.objective || "";
  const explanation = blocks?.["EXPLICATION"] || item.explanation || "";
  const method = blocks?.["MÉTHODE CABINET"] || item.method || "";
  const example = blocks?.["EXEMPLE"] || item.example || "";
  const remember = blocks?.["À RETENIR"] || item.remember || "";

  body.innerHTML = `
    <div class="modalTitle">${escapeHtml(item.title)}</div>

    ${objective ? `
      <div class="block">
        <div class="blockTitle">OBJECTIF</div>
        <div class="blockBody">${escapeHtml(objective)}</div>
      </div>
    ` : ``}

    ${explanation ? `
      <div class="block">
        <div class="blockTitle">EXPLICATION</div>
        <div class="blockBody">${escapeHtml(explanation)}</div>
      </div>
    ` : ``}

    ${method ? `
      <div class="block">
        <div class="blockTitle">MÉTHODE CABINET</div>
        <div class="blockBody mono"><pre class="pre">${escapeHtml(method)}</pre></div>
      </div>
    ` : ``}

    ${example ? `
      <div class="block">
        <div class="blockTitle">EXEMPLE</div>
        <div class="blockBody mono"><pre class="pre">${escapeHtml(example)}</pre></div>
      </div>
    ` : ``}

    ${remember ? `
      <div class="block">
        <div class="blockTitle">À RETENIR</div>
        <div class="blockBody">${escapeHtml(remember)}</div>
      </div>
    ` : ``}
  `;
}

function ensureModalAudioButton() {
  const top = document.querySelector(".modalTop");
  if (!top) return;

  if (top.querySelector("[data-audio-btn]")) return;

  const btn = document.createElement("button");
  btn.className = "iconBtn";
  btn.setAttribute("data-audio-btn", "1");
  btn.setAttribute("aria-label", "Audio");
  btn.innerHTML = `<span class="icon">🔊</span>`;
  btn.style.marginLeft = "10px";

  // le mettre avant le menu, si possible
  const menuBtn = $("modalMenu");
  if (menuBtn && menuBtn.parentElement === top) {
    top.insertBefore(btn, menuBtn);
  } else {
    top.appendChild(btn);
  }
}

// ---------- Filtering ----------
function getActiveList() {
  if (!state.pack) return [];
  if (state.tab === "qcm") return state.pack.qcm;
  if (state.tab === "cas") return state.pack.cases;
  return state.pack.courses;
}

function filterList(list) {
  const q = (state.query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((it) => {
    const hay = [
      it.title,
      it.question,
      it.statement,
      it.explanation,
      it.objective,
      it.method,
      it.example,
      it.remember,
      ...(it.tags || [])
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

// ---------- Escape HTML ----------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- Navigation ----------
async function openModuleById(id) {
  const mod = state.modules.find((m) => m.id === id);
  if (!mod) return;

  toast("Chargement module…");
  const pack = await loadModulePack(mod);

  state.activeModule = mod;
  state.pack = pack;
  state.view = "module";
  state.tab = "cours";
  state.query = "";

  render();
}

function goModules() {
  state.view = "modules";
  state.activeModule = null;
  state.pack = null;
  state.tab = "cours";
  state.query = "";
  render();
}

// ---------- Force refresh ----------
async function forceRefresh() {
  try {
    // stop SW + clear caches
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) {
    console.warn(e);
  } finally {
    toast("Refresh forcé…");
    await sleep(300);
    location.reload(true);
  }
}

// ---------- Render root ----------
function render() {
  if (state.view === "modules") renderModules();
  else renderModule();
}

// ---------- Init ----------
async function init() {
  setBuildNum();
  setNetPill(navigator.onLine);

  window.addEventListener("online", () => setNetPill(true));
  window.addEventListener("offline", () => setNetPill(false));

  await registerSW();

  // Drawer buttons (safe)
  safeOn($("btnMenu"), "click", openDrawer);
  safeOn($("btnClose"), "click", closeDrawer);
  safeOn($("navModules"), "click", () => { closeDrawer(); goModules(); });
  safeOn($("navForceRefresh"), "click", () => { closeDrawer(); forceRefresh(); });

  // Modal buttons
  safeOn($("modalClose"), "click", closeModal);
  safeOn($("prevBtn"), "click", modalPrev);
  safeOn($("nextBtn"), "click", modalNext);

  // Click outside modal sheet to close
  const modal = $("modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Delegation for dynamic UI
  document.addEventListener("click", async (e) => {
    const t = e.target;

    // open module
    const modBtn = t.closest?.("[data-open-module]");
    if (modBtn) {
      const id = modBtn.getAttribute("data-open-module");
      return openModuleById(id);
    }

    // change tab
    const tabBtn = t.closest?.("[data-tab]");
    if (tabBtn) {
      state.tab = tabBtn.getAttribute("data-tab");
      render();
      return;
    }

    // random
    const rnd = t.closest?.("[data-random]");
    if (rnd) {
      const list = filterList(getActiveList());
      if (list.length === 0) return toast("Aucun élément");
      const idx = Math.floor(Math.random() * list.length);
      openModal(list, idx);
      return;
    }

    // open item in current list
    const openItem = t.closest?.("[data-open-item]");
    if (openItem) {
      const idx = Number(openItem.getAttribute("data-open-item") || 0);
      const list = filterList(getActiveList());
      openModal(list, idx);
      return;
    }

    // audio button
    const audioBtn = t.closest?.("[data-audio-btn]");
    if (audioBtn) {
      // si offline/aucune voix => message propre
      speakCurrent();
      return;
    }

    // QCM choice
    const qChoice = t.closest?.("[data-qcm-choice]");
    if (qChoice) {
      const i = Number(qChoice.getAttribute("data-qcm-choice"));
      const item = state.modalList[state.modalIndex];
      if (!item || item.type !== "qcm") return;

      const good = Number(item.answer) === i;
      toast(good ? "✅ Bonne réponse" : "❌ Mauvaise réponse");
      return;
    }
  });

  // Search input live (safe: element recreated on render)
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t && t.id === "searchBox") {
      state.query = t.value || "";
      render();
    }
  });

  // Prepare voices (Android needs delay)
  if (supportsTTS()) {
    // Some browsers populate voices async
    speechSynthesis.onvoiceschanged = () => {
      state.ttsVoice = pickFrenchVoice();
    };
    // small delay + pick
    setTimeout(() => { state.ttsVoice = pickFrenchVoice(); }, 250);
  }

  // Load modules index
  try {
    const index = await fetchJSON("db_index.json");
    state.modules = index.modules || [];
  } catch (e) {
    console.warn(e);
    state.modules = [];
    toast("db_index.json introuvable / HS");
  }

  render();
}

init();