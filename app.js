/* ============================================================
   FiscoPilot - app.js (stable)
   - Modules / Cours / QCM / Cas
   - Modal
   - Audio: Cloudflare Worker (ElevenLabs) + fallback SpeechSynthesis
   ============================================================ */

/* ========================= CONFIG ========================= */
const APP_BUILD = window.APP_BUILD || 101; // tu peux override depuis index.html
const DB_INDEX = "db_index.json";

// Ton worker Cloudflare (NE JAMAIS mettre de clé ici)
const DEFAULT_TTS_ENDPOINT = "https://apikey.marouane1341.workers.dev/"; // POST

// Keys localStorage (optionnel)
const LS_TTS_ENDPOINT = "fp_tts_endpoint";
const LS_TTS_PROVIDER = "fp_tts_provider"; // "worker" | "browser"
const LS_TTS_VOICE = "fp_tts_voice"; // optionnel (si ton worker gère des voix)

/* ========================= STATE ========================= */
const state = {
  modules: [],
  currentModule: null,
  data: { lessons: [], qcm: [], cases: [] },
  tab: "cours",
  search: "",
  modal: { open: false, type: "cours", list: [], index: 0 },

  tts: {
    provider: localStorage.getItem(LS_TTS_PROVIDER) || "worker",
    endpoint: localStorage.getItem(LS_TTS_ENDPOINT) || DEFAULT_TTS_ENDPOINT,
    voice: localStorage.getItem(LS_TTS_VOICE) || "",

    speaking: false,
    audio: null,
    utterance: null,
    browserVoice: null,
  },
};

/* ========================= HELPERS ========================= */
const $ = (sel, root = document) => root.querySelector(sel);

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textPreview(s, max = 180) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function normalizeLevel(s) {
  const t = String(s ?? "").trim();
  if (!t) return "Débutant";
  return t;
}

/* ========================= TOAST ========================= */
let toastTimer = null;
function toast(msg, ms = 1700) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "18px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 14px";
    el.style.borderRadius = "14px";
    el.style.background = "rgba(0,0,0,.70)";
    el.style.color = "#fff";
    el.style.fontSize = "14px";
    el.style.zIndex = "9999";
    el.style.maxWidth = "86vw";
    el.style.textAlign = "center";
    el.style.backdropFilter = "blur(8px)";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, ms);
}

/* ========================= NETWORK PILL ========================= */
function setOnlinePill() {
  const pill = $("#netPill");
  if (!pill) return;
  if (navigator.onLine) {
    pill.textContent = "En ligne";
    pill.classList.remove("offline");
  } else {
    pill.textContent = "Hors ligne";
    pill.classList.add("offline");
  }
}

/* ========================= FETCH JSON (cache) ========================= */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return await res.json();
}

/* ========================= RENDER ========================= */
function render() {
  const app = $("#app");
  if (!app) return;

  // Vue modules
  if (!state.currentModule) {
    app.innerHTML = `
      <div class="hero">
        <h1>Modules</h1>
        <p>Choisis un module. Les cours premium ont un objectif, une explication claire, des exemples et “à retenir”.</p>
      </div>

      <div id="moduleList" class="list"></div>
    `;

    const list = $("#moduleList");
    if (list) {
      list.innerHTML = state.modules
        .map((m) => {
          const sources = Array.isArray(m.sources) ? m.sources : [];
          return `
            <div class="card module">
              <div class="moduleHead">
                <div>
                  <div class="moduleTitle">${escapeHTML(m.title || m.id || "Module")}</div>
                  <div class="moduleSub">${escapeHTML(sources.join(", "))}</div>
                </div>
                <button class="btn primary" data-open-module="${escapeHTML(m.id)}">Ouvrir</button>
              </div>
              <div class="moduleMeta">
                <span class="chip">📦 Sources: ${sources.length}</span>
              </div>
            </div>
          `;
        })
        .join("");
    }

    bindModuleButtons();
    return;
  }

  // Vue module
  const counts = {
    cours: state.data.lessons.length,
    qcm: state.data.qcm.length,
    cas: state.data.cases.length,
  };

  app.innerHTML = `
    <div class="card moduleTop">
      <div class="moduleTitleBig">📘 ${escapeHTML(state.currentModule.title || state.currentModule.id || "Module")}</div>
      <div class="moduleSub">Cours: ${counts.cours} • QCM: ${counts.qcm} • Cas: ${counts.cas}</div>
      <div class="moduleSub">${escapeHTML((state.currentModule.sources || []).join(", "))}</div>

      <div class="row gap">
        <button class="btn" id="backModules">← Retour</button>
        <div class="seg">
          <button class="segBtn ${state.tab === "cours" ? "active" : ""}" data-tab="cours">📘 Cours</button>
          <button class="segBtn ${state.tab === "qcm" ? "active" : ""}" data-tab="qcm">🧪 QCM</button>
          <button class="segBtn ${state.tab === "cas" ? "active" : ""}" data-tab="cas">🧾 Cas</button>
        </div>
      </div>

      <div class="row gap top">
        <input id="search" class="input" placeholder="Rechercher (ex: prorata, facture...)" value="${escapeHTML(state.search)}"/>
        <button class="btn primary" id="randomBtn">Aléatoire</button>
      </div>
    </div>

    <div id="items" class="list"></div>
  `;

  bindModuleUI();
  renderItems();
}

function renderItems() {
  const box = $("#items");
  if (!box) return;

  const q = state.search.trim().toLowerCase();
  const tab = state.tab;

  let items = [];
  if (tab === "cours") items = state.data.lessons.map((x, i) => ({ ...x, _type: "cours", _index: i }));
  if (tab === "qcm") items = state.data.qcm.map((x, i) => ({ ...x, _type: "qcm", _index: i }));
  if (tab === "cas") items = state.data.cases.map((x, i) => ({ ...x, _type: "cas", _index: i }));

  if (q) {
    items = items.filter((it) => {
      const hay = JSON.stringify(it).toLowerCase();
      return hay.includes(q);
    });
  }

  if (!items.length) {
    box.innerHTML = `<div class="card empty">Aucun résultat.</div>`;
    return;
  }

  box.innerHTML = items
    .map((it) => {
      if (it._type === "cours") {
        const level = normalizeLevel(it.level);
        const lvl = level.toLowerCase();
        const tagClass = lvl.includes("expert") ? "chip bad" : (lvl.includes("inter") ? "chip warn" : "chip ok");
        return `
          <div class="card item">
            <div class="itemHead">
              <div class="itemTitle">${escapeHTML(it.title || "Cours")}</div>
              <button class="btn" data-open-item="cours" data-index="${it._index}">Ouvrir</button>
            </div>
            <div class="itemMeta">
              <span class="${tagClass}">${escapeHTML(level)}</span>
              <span class="chip">📌 Cours premium</span>
            </div>
            <div class="itemText">${escapeHTML(textPreview(it.text || ""))}</div>
          </div>
        `;
      }

      if (it._type === "qcm") {
        return `
          <div class="card item">
            <div class="itemHead">
              <div class="itemTitle">${escapeHTML(it.question || "Question")}</div>
              <button class="btn" data-open-item="qcm" data-index="${it._index}">Ouvrir</button>
            </div>
            <div class="itemMeta">
              <span class="chip">🧪 QCM</span>
            </div>
            <div class="itemText">${escapeHTML(textPreview((it.choices || []).join(" • ")))}</div>
          </div>
        `;
      }

      // cas
      return `
        <div class="card item">
          <div class="itemHead">
            <div class="itemTitle">${escapeHTML(it.title || "Cas")}</div>
            <button class="btn" data-open-item="cas" data-index="${it._index}">Ouvrir</button>
          </div>
          <div class="itemMeta">
            <span class="chip">🧾 Cas</span>
          </div>
          <div class="itemText">${escapeHTML(textPreview(it.question || ""))}</div>
        </div>
      `;
    })
    .join("");

  bindOpenItemButtons();
}

/* ========================= MODAL ========================= */
function openModal(type, list, index) {
  state.modal.open = true;
  state.modal.type = type;
  state.modal.list = Array.isArray(list) ? list : [];
  state.modal.index = clamp(Number(index || 0), 0, Math.max(0, state.modal.list.length - 1));

  const m = $("#modal");
  if (m) {
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
  }
  renderModal();
}

function closeModal() {
  stopTTS(true);
  state.modal.open = false;
  const m = $("#modal");
  if (m) {
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
  }
}

function renderModal() {
  const body = $("#modalBody");
  const pos = $("#modalPos");
  const lvl = $("#modalLevel");
  if (!body || !pos || !lvl) return;

  const { type, list } = state.modal;
  const i = clamp(state.modal.index, 0, Math.max(0, list.length - 1));
  state.modal.index = i;

  pos.textContent = `${i + 1}/${list.length}`;
  const item = list[i];

  lvl.textContent = type === "cours" ? normalizeLevel(item.level) : (type === "qcm" ? "QCM" : "Cas");

  if (type === "cours") {
    body.innerHTML = `
      <h2>${escapeHTML(item.title || "Cours")}</h2>
      <div class="content">${formatLesson(item.text || "")}</div>
    `;
    return;
  }

  if (type === "qcm") {
    const choices = Array.isArray(item.choices) ? item.choices : [];
    body.innerHTML = `
      <h2>${escapeHTML(item.question || "QCM")}</h2>
      <div class="h3">CHOISISSEZ</div>
      <div class="choices">
        ${choices
          .map((c, idx) => {
            return `<button class="choiceBtn" data-qcm-choice="${idx + 1}">${idx + 1}) ${escapeHTML(c)}</button>`;
          })
          .join("")}
      </div>

      <div id="qcmExplain" class="explain" style="display:none;">
        <div class="h3">EXPLICATION</div>
        <div id="qcmExplainTxt"></div>
      </div>
    `;

    body.querySelectorAll("[data-qcm-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chosen = Number(btn.getAttribute("data-qcm-choice"));
        const ok = chosen === Number(item.answer);
        toast(ok ? "✅ Bonne réponse" : "❌ Pas correct");

        const ex = $("#qcmExplain");
        const exTxt = $("#qcmExplainTxt");
        if (ex && exTxt) {
          exTxt.textContent = item.explain || "";
          ex.style.display = "block";
        }
      });
    });

    return;
  }

  // cas
  body.innerHTML = `
    <h2>${escapeHTML(item.title || "Cas")}</h2>
    <div class="h3">QUESTION</div>
    <div class="content">${escapeHTML(item.question || "")}</div>

    <div class="h3">RÉPONSE</div>
    <button class="btn" id="showAnswer">Afficher la réponse</button>
    <div class="content" id="caseAnswer" style="display:none;"></div>
  `;

  const show = $("#showAnswer");
  const ans = $("#caseAnswer");
  if (show && ans) {
    show.addEventListener("click", () => {
      ans.textContent = (item.answer_md || item.answer || "").replace(/\s+/g, " ").trim();
      ans.style.display = "block";
      show.style.display = "none";
    });
  }
}

function modalNext() {
  stopTTS(true);
  state.modal.index = clamp(state.modal.index + 1, 0, state.modal.list.length - 1);
  renderModal();
}

function modalPrev() {
  stopTTS(true);
  state.modal.index = clamp(state.modal.index - 1, 0, state.modal.list.length - 1);
  renderModal();
}

/* ========================= LESSON FORMAT ========================= */
function formatLesson(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  // mini parser: titres en MAJUSCULES sur une ligne (OBJECTIF, EXPLICATION, EXEMPLE, À RETENIR...)
  const lines = text.split("\n");
  const blocks = [];
  let current = { title: "", body: [] };

  const isTitle = (l) => {
    const t = l.trim();
    if (!t) return false;
    // titres courts, pas une phrase
    if (t.length > 40) return false;
    // contient beaucoup de lettres + pas de point final
    const upper = t.toUpperCase() === t;
    const endsDot = /[.!?]$/.test(t);
    return upper && !endsDot;
  };

  for (const line of lines) {
    if (isTitle(line)) {
      if (current.title || current.body.length) blocks.push(current);
      current = { title: line.trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.title || current.body.length) blocks.push(current);

  const html = blocks
    .map((b) => {
      const title = b.title ? `<div class="h3">${escapeHTML(b.title)}</div>` : "";
      const body = escapeHTML(b.body.join("\n").trim()).replaceAll("\n", "<br/>");
      return `${title}<div class="content">${body}</div>`;
    })
    .join("");

  return html;
}

/* ========================= AUDIO (Worker ElevenLabs + fallback) ========================= */
function initBrowserVoices() {
  if (!("speechSynthesis" in window)) return;

  const pick = () => {
    const voices = window.speechSynthesis.getVoices() || [];
    const fr = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("fr"));
    const prefer = ["Google", "Microsoft", "Samsung", "Apple"];
    let best = null;

    for (const p of prefer) {
      best = fr.find((v) => (v.name || "").includes(p));
      if (best) break;
    }
    if (!best) best = fr[0] || voices[0] || null;
    state.tts.browserVoice = best;
  };

  pick();
  window.speechSynthesis.onvoiceschanged = pick;
}

function getSpeakTextFromModal() {
  const body = $("#modalBody");
  if (!body) return "";
  const txt = body.innerText || "";
  return txt.replace(/\s+\n/g, "\n").trim();
}

async function speakModal() {
  const text = getSpeakTextFromModal();
  if (!text) return toast("Rien à lire.");

  // Toggle stop
  if (state.tts.speaking) {
    stopTTS(true);
    return toast("⏹️ Audio arrêté");
  }

  // Provider
  if (state.tts.provider === "browser") {
    return speakBrowser(text);
  }

  // default "worker"
  const ok = await speakViaWorker(text);
  if (!ok) {
    // fallback
    toast("Fallback audio navigateur…");
    return speakBrowser(text);
  }
}

async function speakViaWorker(text) {
  const endpoint = (state.tts.endpoint || "").trim() || DEFAULT_TTS_ENDPOINT;
  if (!endpoint.startsWith("http")) {
    toast("Endpoint audio invalide.");
    return false;
  }

  try {
    stopTTS(false);

    // Ton Worker doit accepter POST JSON { text, voice? } et renvoyer audio/mpeg
    const payload = { text };
    if (state.tts.voice) payload.voice = state.tts.voice;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      toast(`Erreur audio (worker): ${res.status}`);
      return false;
    }

    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 1000) {
      toast("Audio vide (worker).");
      return false;
    }

    const blob = new Blob([buf], { type: res.headers.get("content-type") || "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    const audio = new Audio();
    audio.src = url;
    audio.preload = "auto";

    state.tts.audio = audio;
    state.tts.speaking = true;

    audio.onended = () => {
      state.tts.speaking = false;
      try { URL.revokeObjectURL(url); } catch (_) {}
      state.tts.audio = null;
    };
    audio.onerror = () => {
      state.tts.speaking = false;
      try { URL.revokeObjectURL(url); } catch (_) {}
      state.tts.audio = null;
      toast("Erreur lecture audio.");
    };

    await audio.play();
    toast("🔊 Audio…");
    return true;
  } catch (e) {
    state.tts.speaking = false;
    state.tts.audio = null;
    toast("Erreur audio (worker).");
    return false;
  }
}

function speakBrowser(text) {
  if (!("speechSynthesis" in window)) {
    toast("Audio non supporté sur ce navigateur.");
    return;
  }

  try {
    stopTTS(false);

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    if (state.tts.browserVoice) u.voice = state.tts.browserVoice;

    // Réglages “plus humain” (dans la limite de la voix dispo)
    u.rate = 0.95;
    u.pitch = 1.0;
    u.volume = 1.0;

    u.onstart = () => { state.tts.speaking = true; };
    u.onend = () => { state.tts.speaking = false; };
    u.onerror = () => { state.tts.speaking = false; toast("Erreur audio."); };

    state.tts.utterance = u;
    window.speechSynthesis.speak(u);
    toast("🔊 Audio…");
  } catch (e) {
    state.tts.speaking = false;
    toast("Erreur audio.");
  }
}

function stopTTS(hardCancel) {
  // stop worker audio
  if (state.tts.audio) {
    try {
      state.tts.audio.pause();
      state.tts.audio.currentTime = 0;
    } catch (_) {}
    state.tts.audio = null;
  }

  // stop browser tts
  if ("speechSynthesis" in window) {
    try {
      if (hardCancel) window.speechSynthesis.cancel();
      else window.speechSynthesis.cancel();
    } catch (_) {}
  }

  state.tts.utterance = null;
  state.tts.speaking = false;
}

/* ========================= BINDINGS ========================= */
function bindModuleButtons() {
  document.querySelectorAll("[data-open-module]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-open-module");
      const mod = state.modules.find((m) => m.id === id);
      if (!mod) return toast("Module introuvable.");
      await openModule(mod);
    });
  });
}

function bindModuleUI() {
  const back = $("#backModules");
  if (back) {
    back.addEventListener("click", () => {
      state.currentModule = null;
      state.data = { lessons: [], qcm: [], cases: [] };
      state.tab = "cours";
      state.search = "";
      render();
    });
  }

  document.querySelectorAll("[data-tab]").forEach((t) => {
    t.addEventListener("click", () => {
      state.tab = t.getAttribute("data-tab") || "cours";
      state.search = "";
      render();
    });
  });

  const s = $("#search");
  if (s) {
    s.addEventListener("input", () => {
      state.search = s.value || "";
      renderItems();
    });
  }

  const rnd = $("#randomBtn");
  if (rnd) {
    rnd.addEventListener("click", () => {
      let list = [];
      if (state.tab === "cours") list = state.data.lessons;
      if (state.tab === "qcm") list = state.data.qcm;
      if (state.tab === "cas") list = state.data.cases;

      if (!list.length) return toast("Aucun élément.");
      const idx = Math.floor(Math.random() * list.length);
      openModal(state.tab, list, idx);
    });
  }
}

function bindOpenItemButtons() {
  document.querySelectorAll("[data-open-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-open-item");
      const idx = Number(btn.getAttribute("data-index") || "0");
      let list = [];
      if (type === "cours") list = state.data.lessons;
      if (type === "qcm") list = state.data.qcm;
      if (type === "cas") list = state.data.cases;
      openModal(type, list, idx);
    });
  });
}

function bindGlobalUI() {
  const build = $("#buildNum");
  if (build) build.textContent = String(APP_BUILD);

  // drawer (si présent)
  const btnMenu = $("#btnMenu");
  const drawer = $("#drawer");
  const btnClose = $("#btnClose");
  const navModules = $("#navModules");
  const navForce = $("#navForceRefresh");

  const openDrawer = () => {
    if (!drawer) return;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  };
  const closeDrawer = () => {
    if (!drawer) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  };

  if (btnMenu) btnMenu.addEventListener("click", openDrawer);
  if (btnClose) btnClose.addEventListener("click", closeDrawer);

  if (navModules) {
    navModules.addEventListener("click", () => {
      closeDrawer();
      state.currentModule = null;
      render();
    });
  }

  if (navForce) {
    navForce.addEventListener("click", async () => {
      closeDrawer();
      toast("Refresh…");
      try {
        await initData(true);
        if (state.currentModule) await openModule(state.currentModule, true);
        else render();
        toast("✅ OK");
      } catch (e) {
        toast("Erreur refresh");
      }
    });
  }

  // modal controls
  const modal = $("#modal");
  const modalClose = $("#modalClose");
  const prevBtn = $("#prevBtn");
  const nextBtn = $("#nextBtn");
  const ttsBtn = $("#ttsBtn");

  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (prevBtn) prevBtn.addEventListener("click", modalPrev);
  if (nextBtn) nextBtn.addEventListener("click", modalNext);
  if (ttsBtn) ttsBtn.addEventListener("click", speakModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Online pill
  window.addEventListener("online", setOnlinePill);
  window.addEventListener("offline", setOnlinePill);
  setOnlinePill();
}

/* ========================= DATA ========================= */
async function initData(force = false) {
  // charge db_index.json
  const index = await fetchJSON(DB_INDEX);
  const mods = index?.modules;
  state.modules = Array.isArray(mods) ? mods : [];

  // Normalise
  state.modules = state.modules.map((m) => ({
    id: m.id || m.title || cryptoRandomId(),
    title: m.title || m.id || "Module",
    sources: Array.isArray(m.sources) ? m.sources : [],
  }));
}

async function openModule(mod, force = false) {
  state.currentModule = mod;

  const sources = Array.isArray(mod.sources) ? mod.sources : [];
  const merged = { lessons: [], qcm: [], cases: [] };

  for (const src of sources) {
    const data = await fetchJSON(src);
    if (Array.isArray(data.lessons)) merged.lessons.push(...data.lessons);
    if (Array.isArray(data.qcm)) merged.qcm.push(...data.qcm);
    if (Array.isArray(data.cases)) merged.cases.push(...data.cases);
  }

  state.data = merged;
  state.tab = "cours";
  state.search = "";
  render();
}

/* ========================= MISC ========================= */
function cryptoRandomId() {
  try {
    return crypto.randomUUID();
  } catch (_) {
    return "m_" + Math.random().toString(16).slice(2);
  }
}

/* ========================= INIT ========================= */
async function main() {
  initBrowserVoices();

  // SW (si dispo)
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (_) {}
  }

  bindGlobalUI();

  try {
    await initData();
    render();
  } catch (e) {
    const app = $("#app");
    if (app) {
      app.innerHTML = `
        <div class="card">
          <h2>Erreur</h2>
          <div class="content">${escapeHTML(String(e?.message || e))}</div>
          <button class="btn primary" onclick="location.reload()">Recharger</button>
        </div>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", main);