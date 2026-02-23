/* app.js — FiscoPilot (STABLE)
   - Modules/Cours/QCM/Cas + navigation
   - Recherche + aléatoire
   - Audio TTS via Cloudflare Worker (POST) => mp3
   - Robust Android/Samsung playback (user gesture required)
   - Offline-friendly caching (localStorage + optional Cache API for JSON)
*/

/* =======================
   CONFIG
======================= */
const APP = {
  name: "FiscoPilot AI ELITE MAX",
  build: "STABLE",
  locale: "fr-BE",

  // ✅ Mets ici ton Worker Cloudflare (celui qui répond au POST et renvoie un MP3)
  // Exemple: "https://elevenapikey.marouane1341.workers.dev/"
  ttsEndpoint: "https://elevenapikey.marouane1341.workers.dev/",

  // Sources (JSON locaux sur GitHub Pages)
  sources: [
    "db/tva.json",
    "db/tva_1_fondations.json",
    "db/tva_2_pratique.json",
    "db/tva_3_expert.json",
  ],

  // Caches
  cachePrefix: "fiscopilot_v1_",
  maxAudioCacheItems: 10, // cache audio en mémoire (urls blob)
};

/* =======================
   STATE
======================= */
const state = {
  modules: [], // { id, title, sources, items: [], stats: {cours,qcm,cas} }
  activeModuleId: null,
  activeTab: "cours", // "cours"|"qcm"|"cas"
  list: [], // items filtered by module+tab+search
  index: -1, // current item index in list (viewer)
  search: "",
  isOnline: navigator.onLine,

  // audio
  audio: null,
  lastAudioKey: null,
  audioCache: new Map(), // key -> { url, createdAt }
  audioBusy: false,
};

/* =======================
   UTIL
======================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeText(v) {
  if (v == null) return "";
  return String(v);
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function logStatus(msg, type = "info") {
  const el = $("#statusText");
  if (!el) return;
  el.textContent = msg;
  el.dataset.type = type;
  el.style.opacity = "1";
  // auto-fade
  clearTimeout(logStatus._t);
  logStatus._t = setTimeout(() => {
    el.style.opacity = "0.85";
  }, 2500);
}

function setOnlineBadge() {
  const badge = $("#onlineBadge");
  if (!badge) return;
  badge.textContent = state.isOnline ? "En ligne" : "Hors ligne";
  badge.classList.toggle("offline", !state.isOnline);
}

/* =======================
   STORAGE
======================= */
function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(APP.cachePrefix + key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(APP.cachePrefix + key, JSON.stringify(value));
  } catch {}
}

/* =======================
   LOADING JSON (cache)
======================= */
async function fetchJsonCached(url) {
  const cacheKey = "json::" + url;

  // 1) localStorage first (fast)
  const cached = lsGet(cacheKey);
  if (cached && cached.data && cached.ts && Date.now() - cached.ts < 1000 * 60 * 60 * 24 * 30) {
    return cached.data;
  }

  // 2) Cache API (optional)
  if ("caches" in window) {
    try {
      const c = await caches.open(APP.cachePrefix + "json");
      const hit = await c.match(url);
      if (hit) {
        const data = await hit.json();
        lsSet(cacheKey, { ts: Date.now(), data });
        return data;
      }
    } catch {}
  }

  // 3) network
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} on ${url}`);
  const data = await res.json();

  // store
  lsSet(cacheKey, { ts: Date.now(), data });

  if ("caches" in window) {
    try {
      const c = await caches.open(APP.cachePrefix + "json");
      c.put(url, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } }));
    } catch {}
  }
  return data;
}

/* =======================
   NORMALIZE DATA
======================= */
/*
  Attendu: chaque JSON peut être:
  - { modules: [...] }
  - { cours: [...], qcm: [...], cas: [...] }
  - { items: [...] }
  - ou un tableau directement
*/
function normalizeSourcePayload(payload, sourceName) {
  const out = [];

  const pushItem = (item, typeGuess) => {
    if (!item) return;
    const type =
      item.type ||
      item.kind ||
      typeGuess ||
      (item.choices ? "qcm" : item.solution ? "cas" : "cours");

    out.push({
      id: item.id || item.slug || cryptoRandomId(),
      type,
      title: item.title || item.question || item.nom || "Sans titre",
      level: item.level || item.niveau || "Débutant",
      tags: item.tags || item.thematiques || [],
      module: item.module || item.matiere || item.category || "TVA Belgique",
      objective: item.objectif || item.objective || "",
      explanation: item.explication || item.explanation || item.contenu || "",
      method: item.methode || item.method || "",
      example: item.exemple || item.example || "",
      takeaway: item.a_retenir || item.takeaway || item.retenir || "",
      // QCM
      question: item.question || "",
      choices: item.choices || item.options || null,
      answer: item.answer || item.reponse || item.correct || null,
      rationale: item.rationale || item.justification || "",
      // Cas
      scenario: item.scenario || item.case || item.cas || "",
      solution: item.solution || item.correction || "",
      source: sourceName,
      raw: item,
    });
  };

  const walkArray = (arr, typeGuess) => {
    if (!Array.isArray(arr)) return;
    for (const it of arr) pushItem(it, typeGuess);
  };

  if (Array.isArray(payload)) {
    walkArray(payload);
    return out;
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.modules)) {
      // payload.modules can contain nested items
      for (const m of payload.modules) {
        const mTitle = m.title || m.nom || m.name || "Module";
        const mItems = m.items || m.contenu || m.data || [];
        if (Array.isArray(mItems)) {
          for (const it of mItems) pushItem({ ...it, module: mTitle }, it.type);
        }
        // common keys
        walkArray(m.cours, "cours");
        walkArray(m.qcm, "qcm");
        walkArray(m.cas, "cas");
      }
      // also allow top-level
      walkArray(payload.cours, "cours");
      walkArray(payload.qcm, "qcm");
      walkArray(payload.cas, "cas");
      walkArray(payload.items);
      return out;
    }

    walkArray(payload.cours, "cours");
    walkArray(payload.qcm, "qcm");
    walkArray(payload.cas, "cas");
    walkArray(payload.items);

    // maybe one key holding array
    for (const k of Object.keys(payload)) {
      if (Array.isArray(payload[k]) && ["cours", "qcm", "cas", "items"].includes(k) === false) {
        // ignore noisy arrays unless looks like content
        const sample = payload[k][0];
        if (sample && (sample.title || sample.question || sample.explanation || sample.explication || sample.choices)) {
          walkArray(payload[k]);
        }
      }
    }
  }

  return out;
}

function cryptoRandomId() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
  } catch {
    return "id_" + Math.random().toString(16).slice(2);
  }
}

/* =======================
   BUILD MODULES
======================= */
function buildModulesFromItems(items) {
  const byModule = new Map();

  for (const it of items) {
    const moduleName = it.module || "Module";
    if (!byModule.has(moduleName)) {
      byModule.set(moduleName, {
        id: moduleName,
        title: moduleName,
        sources: new Set(),
        items: [],
        stats: { cours: 0, qcm: 0, cas: 0 },
      });
    }
    const m = byModule.get(moduleName);
    m.items.push(it);
    m.sources.add(it.source);
    if (it.type === "qcm") m.stats.qcm++;
    else if (it.type === "cas") m.stats.cas++;
    else m.stats.cours++;
  }

  const modules = Array.from(byModule.values()).map((m) => ({
    ...m,
    sources: Array.from(m.sources),
  }));

  // Sort stable
  modules.sort((a, b) => a.title.localeCompare(b.title, "fr"));

  return modules;
}

/* =======================
   UI RENDER
======================= */
function renderHeader() {
  $("#appTitle").textContent = APP.name;
  $("#buildBadge").textContent = "Build " + APP.build;
  setOnlineBadge();
}

function renderModules() {
  const list = $("#modulesList");
  if (!list) return;

  list.innerHTML = "";

  for (const m of state.modules) {
    const card = document.createElement("div");
    card.className = "card module";

    const header = document.createElement("div");
    header.className = "cardHead";

    const left = document.createElement("div");
    left.className = "cardLeft";

    const title = document.createElement("div");
    title.className = "cardTitle";
    title.textContent = "📚 " + m.title;

    const meta = document.createElement("div");
    meta.className = "cardMeta";
    meta.textContent = `Cours: ${m.stats.cours} • QCM: ${m.stats.qcm} • Cas: ${m.stats.cas}`;

    const sources = document.createElement("div");
    sources.className = "cardSub";
    sources.textContent = "Sources: " + m.sources.join(", ");

    left.appendChild(title);
    left.appendChild(meta);
    left.appendChild(sources);

    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = "Ouvrir";
    btn.onclick = () => openModule(m.id);

    header.appendChild(left);
    header.appendChild(btn);

    card.appendChild(header);
    list.appendChild(card);
  }

  if (state.modules.length === 0) {
    list.innerHTML = `<div class="empty">Aucun module.</div>`;
  }
}

function renderModuleScreen() {
  const m = state.modules.find((x) => x.id === state.activeModuleId);
  if (!m) {
    showToast("Module introuvable.");
    goHome();
    return;
  }

  $("#moduleTitle").textContent = m.title;
  $("#moduleMeta").textContent = `Cours: ${m.stats.cours} • QCM: ${m.stats.qcm} • Cas: ${m.stats.cas}`;
  $("#moduleSources").textContent = `Sources: ${m.sources.join(", ")}`;

  // tabs
  $$(".tabBtn").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.activeTab));

  // search
  const inp = $("#searchInput");
  if (inp) inp.value = state.search || "";

  // list of items
  state.list = computeFilteredList(m);
  renderItemCards();
}

function computeFilteredList(m) {
  let items = m.items.filter((it) => {
    if (state.activeTab === "cours") return it.type !== "qcm" && it.type !== "cas";
    return it.type === state.activeTab;
  });

  const q = (state.search || "").trim().toLowerCase();
  if (q) {
    items = items.filter((it) => {
      const blob = [
        it.title,
        it.objective,
        it.explanation,
        it.method,
        it.example,
        it.takeaway,
        it.question,
        Array.isArray(it.tags) ? it.tags.join(" ") : "",
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }

  // stable sort: level then title
  items.sort((a, b) => {
    const la = safeText(a.level).localeCompare(safeText(b.level), "fr");
    if (la !== 0) return la;
    return safeText(a.title).localeCompare(safeText(b.title), "fr");
  });

  return items;
}

function renderItemCards() {
  const wrap = $("#itemsList");
  if (!wrap) return;

  wrap.innerHTML = "";

  if (!state.list.length) {
    wrap.innerHTML = `<div class="empty">Aucun résultat.</div>`;
    return;
  }

  for (let i = 0; i < state.list.length; i++) {
    const it = state.list[i];

    const card = document.createElement("div");
    card.className = "card item";
    card.onclick = () => openViewer(i);

    const top = document.createElement("div");
    top.className = "itemTop";

    const title = document.createElement("div");
    title.className = "itemTitle";
    title.textContent = it.title;

    const chips = document.createElement("div");
    chips.className = "chips";
    chips.innerHTML = `
      <span class="chip level">${escapeHtml(it.level || "Débutant")}</span>
      <span class="chip pin">📌 ${escapeHtml(it.module)}</span>
      <span class="chip type">${escapeHtml(labelType(it.type))}</span>
    `;

    const preview = document.createElement("div");
    preview.className = "itemPreview";
    preview.textContent = summarizeItem(it);

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Ouvrir";
    btn.onclick = (e) => {
      e.stopPropagation();
      openViewer(i);
    };

    top.appendChild(title);
    top.appendChild(btn);

    card.appendChild(top);
    card.appendChild(chips);
    card.appendChild(preview);

    wrap.appendChild(card);
  }
}

function labelType(t) {
  if (t === "qcm") return "QCM";
  if (t === "cas") return "Cas";
  return "Cours";
}

function summarizeItem(it) {
  const parts = [];
  if (it.objective) parts.push("OBJECTIF: " + it.objective);
  else if (it.question) parts.push("QUESTION: " + it.question);
  else if (it.scenario) parts.push("CAS: " + it.scenario);

  if (it.explanation) parts.push("EXPLICATION: " + it.explanation);
  else if (it.rationale) parts.push("EXPLICATION: " + it.rationale);

  const txt = parts.join(" ");
  return txt.length > 160 ? txt.slice(0, 160) + "…" : txt;
}

function renderViewer() {
  const it = state.list[state.index];
  if (!it) {
    showToast("Contenu introuvable.");
    closeViewer();
    return;
  }

  $("#viewerTitle").textContent = it.title;
  $("#viewerProgress").textContent = `${state.index + 1}/${state.list.length}`;

  // Chips
  $("#viewerChips").innerHTML = `
    <span class="chip level">${escapeHtml(it.level || "Débutant")}</span>
    <span class="chip pin">📌 ${escapeHtml(it.module)}</span>
    <span class="chip type">${escapeHtml(labelType(it.type))}</span>
  `;

  // Content blocks
  const blocks = [];

  if (it.type === "qcm") {
    blocks.push(block("CHOISISSEZ", renderQcmChoices(it)));
    if (it.rationale || it.explanation) blocks.push(block("EXPLICATION", escapeHtml(it.rationale || it.explanation)));
  } else if (it.type === "cas") {
    if (it.objective) blocks.push(block("OBJECTIF", escapeHtml(it.objective)));
    if (it.scenario) blocks.push(block("CAS", escapeHtml(it.scenario)));
    if (it.solution) blocks.push(block("SOLUTION", escapeHtml(it.solution)));
    if (it.takeaway) blocks.push(block("À RETENIR", escapeHtml(it.takeaway)));
  } else {
    if (it.objective) blocks.push(block("OBJECTIF", escapeHtml(it.objective)));
    if (it.explanation) blocks.push(block("EXPLICATION", escapeHtml(it.explanation)));
    if (it.method) blocks.push(block("MÉTHODE CABINET", escapeHtml(it.method)));
    if (it.example) blocks.push(block("EXEMPLE", escapeHtml(it.example)));
    if (it.takeaway) blocks.push(block("À RETENIR", escapeHtml(it.takeaway)));
  }

  $("#viewerBody").innerHTML = blocks.join("");

  // Audio button
  const audioBtn = $("#btnAudio");
  if (audioBtn) {
    audioBtn.disabled = false;
    audioBtn.textContent = state.audioBusy ? "Audio…" : "Audio";
  }
}

/* =======================
   QCM UI (simple)
======================= */
function renderQcmChoices(it) {
  const opts = Array.isArray(it.choices) ? it.choices : [];
  if (!opts.length) return `<div class="muted">Options non disponibles.</div>`;

  const uid = "qcm_" + it.id;
  const correct = normalizeAnswer(it.answer);

  const html = opts
    .map((opt, idx) => {
      const val = String(idx + 1);
      return `
        <button class="choiceBtn" data-q="${uid}" data-idx="${idx}">
          <span class="choiceIndex">${idx + 1})</span>
          <span class="choiceText">${escapeHtml(opt)}</span>
        </button>
      `;
    })
    .join("");

  // Attach handler after render
  setTimeout(() => {
    $$(`.choiceBtn[data-q="${uid}"]`).forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        const isCorrect = correct != null ? correct === idx || correct === idx + 1 : null;

        $$(`.choiceBtn[data-q="${uid}"]`).forEach((b) => b.classList.remove("selected", "good", "bad"));
        btn.classList.add("selected");

        if (isCorrect === true) {
          btn.classList.add("good");
          showToast("✅ Bonne réponse");
        } else if (isCorrect === false) {
          btn.classList.add("bad");
          showToast("❌ Mauvaise réponse");
        } else {
          showToast("Réponse enregistrée");
        }
      };
    });
  }, 0);

  return `<div class="choices">${html}</div>`;
}

function normalizeAnswer(ans) {
  if (ans == null) return null;
  if (typeof ans === "number") return ans; // could be 0-based or 1-based
  if (typeof ans === "string") {
    const n = parseInt(ans, 10);
    if (!Number.isNaN(n)) return n;
  }
  if (typeof ans === "object") {
    if (typeof ans.index === "number") return ans.index;
    if (typeof ans.choice === "number") return ans.choice;
  }
  return null;
}

/* =======================
   NAV
======================= */
function showScreen(name) {
  $$(".screen").forEach((s) => s.classList.add("hidden"));
  const el = $("#" + name);
  if (el) el.classList.remove("hidden");
}

function goHome() {
  state.activeModuleId = null;
  state.index = -1;
  showScreen("screenHome");
  renderModules();
}

function openModule(moduleId) {
  state.activeModuleId = moduleId;
  state.activeTab = state.activeTab || "cours";
  state.search = "";
  showScreen("screenModule");
  renderModuleScreen();
}

function openViewer(idx) {
  state.index = clamp(idx, 0, state.list.length - 1);
  showScreen("screenViewer");
  renderViewer();
}

function closeViewer() {
  state.index = -1;
  showScreen("screenModule");
  renderModuleScreen();
}

/* =======================
   TOAST
======================= */
function showToast(text) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* =======================
   AUDIO (TTS via Worker)
======================= */
function getSpeakText(it) {
  // Texte "humain" et court (Samsung aime mieux pas trop long)
  const chunks = [];

  chunks.push(it.title);

  if (it.type === "qcm") {
    if (it.question) chunks.push("Question. " + it.question);
    if (Array.isArray(it.choices) && it.choices.length) {
      chunks.push("Options.");
      it.choices.forEach((c, i) => chunks.push(`${i + 1}. ${c}`));
    }
  } else if (it.type === "cas") {
    if (it.objective) chunks.push("Objectif. " + it.objective);
    if (it.scenario) chunks.push("Cas. " + it.scenario);
    if (it.solution) chunks.push("Solution. " + it.solution);
  } else {
    if (it.objective) chunks.push("Objectif. " + it.objective);
    if (it.explanation) chunks.push("Explication. " + it.explanation);
    if (it.method) chunks.push("Méthode cabinet. " + it.method);
    if (it.example) chunks.push("Exemple. " + it.example);
    if (it.takeaway) chunks.push("À retenir. " + it.takeaway);
  }

  // Nettoyage léger
  const txt = chunks
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

  // Limiter longueur pour éviter erreurs / détections / latence
  return txt.length > 1400 ? txt.slice(0, 1400) + "…" : txt;
}

function audioCacheSet(key, url) {
  // prune
  if (state.audioCache.size >= APP.maxAudioCacheItems) {
    const oldest = Array.from(state.audioCache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) {
      URL.revokeObjectURL(oldest[1].url);
      state.audioCache.delete(oldest[0]);
    }
  }
  state.audioCache.set(key, { url, createdAt: Date.now() });
}

async function ensureAudioElement() {
  if (state.audio) return state.audio;
  const a = new Audio();
  a.preload = "auto";
  a.playsInline = true;
  a.crossOrigin = "anonymous";
  a.onended = () => logStatus("Fin audio.", "info");
  a.onerror = () => logStatus("Erreur audio (lecteur).", "error");
  state.audio = a;
  return a;
}

// IMPORTANT: sur Android, play() doit être déclenché par un geste utilisateur
async function playAudioFromUrl(url) {
  const a = await ensureAudioElement();

  // Stop previous
  try {
    a.pause();
  } catch {}
  a.src = url;

  try {
    await a.play();
    return true;
  } catch (e) {
    // fallback: show native controls prompt
    return false;
  }
}

async function ttsSpeakCurrent() {
  const it = state.list[state.index];
  if (!it || state.audioBusy) return;

  state.audioBusy = true;
  $("#btnAudio").textContent = "Audio…";
  $("#btnAudio").disabled = true;

  try {
    const text = getSpeakText(it);
    const key = "tts::" + hashMini(text);

    // cache hit
    const hit = state.audioCache.get(key);
    if (hit?.url) {
      logStatus("🔁 Audio (cache)", "ok");
      const ok = await playAudioFromUrl(hit.url);
      if (!ok) showToast("Appuie sur ▶️ Play dans le lecteur (Android).");
      return;
    }

    logStatus("🔊 Génération audio…", "info");

    // Call Worker
    const res = await fetch(APP.ttsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Format minimal attendu par ton Worker
        text,
        // tu peux ajouter voice/model si ton worker gère:
        // voice: "Rachel",
        // model: "eleven_multilingual_v2",
      }),
    });

    if (!res.ok) {
      const t = await safeReadText(res);
      throw new Error(`TTS HTTP ${res.status}: ${t.slice(0, 180)}`);
    }

    const ct = (res.headers.get("Content-Type") || "").toLowerCase();

    // Si ton worker renvoie une erreur JSON, on la détecte
    if (ct.includes("application/json")) {
      const j = await res.json();
      throw new Error("TTS JSON: " + JSON.stringify(j));
    }

    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 2000) {
      throw new Error("Audio trop court / vide.");
    }

    const blob = new Blob([buf], { type: ct.includes("audio/") ? ct : "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    audioCacheSet(key, url);

    logStatus(`✅ Audio reçu (${Math.round(buf.byteLength / 1024)} KB)`, "ok");

    const ok = await playAudioFromUrl(url);
    if (!ok) showToast("Android: si pas de son, réappuie sur Audio ou ouvre le lecteur.");
  } catch (err) {
    logStatus("❌ " + (err?.message || String(err)), "error");
    showToast("Erreur audio.");
  } finally {
    state.audioBusy = false;
    const btn = $("#btnAudio");
    if (btn) {
      btn.textContent = "Audio";
      btn.disabled = false;
    }
  }
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function hashMini(str) {
  // hash rapide (stable) sans crypto lourd
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/* =======================
   EVENTS
======================= */
function bindEvents() {
  // Burger menu (simple toggle panel)
  $("#btnMenu")?.addEventListener("click", () => {
    $("#sidePanel")?.classList.toggle("open");
  });
  $("#btnClosePanel")?.addEventListener("click", () => {
    $("#sidePanel")?.classList.remove("open");
  });

  $("#btnHome")?.addEventListener("click", () => {
    $("#sidePanel")?.classList.remove("open");
    goHome();
  });

  // module tabs
  $$(".tabBtn").forEach((b) => {
    b.addEventListener("click", () => {
      state.activeTab = b.dataset.tab;
      renderModuleScreen();
    });
  });

  // search
  $("#searchInput")?.addEventListener("input", (e) => {
    state.search = e.target.value || "";
    renderModuleScreen();
  });

  // random
  $("#btnRandom")?.addEventListener("click", () => {
    if (!state.list.length) return showToast("Aucun résultat.");
    const i = Math.floor(Math.random() * state.list.length);
    openViewer(i);
  });

  // viewer nav
  $("#btnPrev")?.addEventListener("click", () => {
    if (!state.list.length) return;
    state.index = clamp(state.index - 1, 0, state.list.length - 1);
    renderViewer();
  });
  $("#btnNext")?.addEventListener("click", () => {
    if (!state.list.length) return;
    state.index = clamp(state.index + 1, 0, state.list.length - 1);
    renderViewer();
  });
  $("#btnCloseViewer")?.addEventListener("click", () => closeViewer());

  // ✅ Audio button (fix Samsung bug: ensures this handler is the user gesture)
  $("#btnAudio")?.addEventListener("click", () => {
    // must be direct call in click to satisfy autoplay policy
    ttsSpeakCurrent();
  });

  // Online/offline
  window.addEventListener("online", () => {
    state.isOnline = true;
    setOnlineBadge();
    logStatus("Connexion rétablie.", "ok");
  });
  window.addEventListener("offline", () => {
    state.isOnline = false;
    setOnlineBadge();
    logStatus("Hors ligne.", "warn");
  });

  // back button (Android)
  window.addEventListener("popstate", () => {
    // Simple: if viewer open -> close, else if module -> home
    const viewerVisible = !$("#screenViewer")?.classList.contains("hidden");
    const moduleVisible = !$("#screenModule")?.classList.contains("hidden");
    if (viewerVisible) closeViewer();
    else if (moduleVisible) goHome();
  });
}

/* =======================
   INIT LOAD
======================= */
async function loadAllSources() {
  logStatus("Chargement…", "info");

  const allItems = [];
  for (const src of APP.sources) {
    try {
      const payload = await fetchJsonCached(src);
      const items = normalizeSourcePayload(payload, src);
      allItems.push(...items);
    } catch (e) {
      console.warn("Source failed", src, e);
      // Continue others
    }
  }

  if (!allItems.length) {
    logStatus("Aucun contenu chargé. Vérifie db/*.json", "error");
  } else {
    logStatus(`✅ Contenu chargé (${allItems.length})`, "ok");
  }

  state.modules = buildModulesFromItems(allItems);

  // Default: first module
  if (!state.activeModuleId && state.modules[0]) {
    // show home first
  }
}

/* =======================
   HTML helpers
======================= */
function escapeHtml(str) {
  const s = String(str ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function block(title, bodyHtml) {
  if (!bodyHtml) return "";
  return `
    <div class="block">
      <div class="blockTitle">${escapeHtml(title)}</div>
      <div class="blockBody">${bodyHtml}</div>
    </div>
  `;
}

/* =======================
   BOOT
======================= */
(async function boot() {
  try {
    renderHeader();
    bindEvents();
    await loadAllSources();

    // Start on home
    showScreen("screenHome");
    renderModules();

    // Small status
    logStatus("Prêt.", "ok");
  } catch (e) {
    console.error(e);
    logStatus("Erreur init: " + (e?.message || String(e)), "error");
  }
})();

/* =======================
   CSS EXPECTED CLASSES / IDs
   (Ton index.html doit contenir ces ids)
   - #appTitle #buildBadge #onlineBadge #statusText
   - screens: #screenHome #screenModule #screenViewer (.screen)
   - home: #modulesList
   - module: #moduleTitle #moduleMeta #moduleSources
            .tabBtn[data-tab="cours|qcm|cas"]
            #searchInput #btnRandom #itemsList
   - viewer: #viewerTitle #viewerProgress #viewerChips #viewerBody
             #btnPrev #btnNext #btnAudio #btnCloseViewer
   - menu: #btnMenu #sidePanel #btnClosePanel #btnHome
   - #toast
======================= */
```0