/* =========================
   FiscoPilot - app.js (stable)
   - Modules / Cours / QCM / Cas
   - Lecteur cours + Audio (Worker ElevenLabs) + fallback SpeechSynthesis
   ========================= */

(() => {
  "use strict";

  /* ========= CONFIG ========= */
  // Mets ici TON worker Cloudflare (celui qui répond "Use POST")
  const TTS_WORKER_URL = "https://elevenapikey.marouane1341.workers.dev/"; // <- change si besoin

  // Fichiers
  const DB_INDEX_PATH = "db_index.json";

  // UI
  const TOAST_MS = 2200;

  /* ========= HELPERS ========= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function toast(msg) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.style.position = "fixed";
      el.style.left = "50%";
      el.style.bottom = "22px";
      el.style.transform = "translateX(-50%)";
      el.style.padding = "10px 14px";
      el.style.borderRadius = "14px";
      el.style.background = "rgba(0,0,0,0.7)";
      el.style.backdropFilter = "blur(10px)";
      el.style.color = "#fff";
      el.style.fontSize = "14px";
      el.style.zIndex = "99999";
      el.style.opacity = "0";
      el.style.transition = "opacity .15s ease";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.style.opacity = "0"), TOAST_MS);
  }

  function safeSetText(sel, txt) {
    const el = $(sel);
    if (el) el.textContent = txt ?? "";
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  async function fetchJSON(url, { timeoutMs = 12000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // cache-bust léger (évite confusion quand GitHub Pages cache)
      const u = url.includes("?") ? `${url}&_=${Date.now()}` : `${url}?_=${Date.now()}`;
      const res = await fetch(u, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  function uniqBy(arr, keyFn) {
    const seen = new Set();
    const out = [];
    for (const it of arr) {
      const k = keyFn(it);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    return out;
  }

  function normalizeText(s) {
    return (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function htmlEscape(s) {
    return (s ?? "").toString().replace(/[&<>"']/g, (c) => {
      switch (c) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#039;";
        default:
          return c;
      }
    });
  }

  /* ========= STATE ========= */
  const state = {
    online: navigator.onLine,
    modules: [],
    activeModule: null, // {id,title,sources[]}
    activeTab: "cours", // cours|qcm|cas
    data: {
      cours: [],
      qcm: [],
      cas: [],
    },
    filtered: {
      cours: [],
      qcm: [],
      cas: [],
    },
    // lecteur cours
    reader: {
      open: false,
      list: [],
      index: 0,
      audio: {
        playing: false,
        mode: "worker", // worker|tts-fallback
        audioEl: null,
        objectUrl: null,
      },
    },
  };

  const storage = {
    get(k, fallback = null) {
      try {
        const v = localStorage.getItem(k);
        if (v === null) return fallback;
        return JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };

  /* ========= DOM CACHE (safe) ========= */
  const dom = {
    // pages/sections
    viewModules: null,
    viewModule: null,

    // modules list
    modulesList: null,

    // module header
    moduleTitle: null,
    moduleMeta: null,

    // tabs
    tabCours: null,
    tabQcm: null,
    tabCas: null,
    btnRandom: null,
    inputSearch: null,

    // list container
    listContainer: null,
    emptyState: null,

    // reader modal
    readerModal: null,
    readerClose: null,
    readerMenu: null,
    readerBadgeLevel: null,
    readerBadgeIndex: null,
    readerTitle: null,
    readerTags: null,
    readerBody: null,
    readerPrev: null,
    readerNext: null,
    readerAudio: null,
  };

  function cacheDom() {
    dom.viewModules = $("#view-modules") || $("#modulesView") || $("#modules");
    dom.viewModule = $("#view-module") || $("#moduleView") || $("#module");

    dom.modulesList = $("#modulesList") || $("#modules-list") || $("#list-modules");

    dom.moduleTitle = $("#moduleTitle") || $("#modTitle");
    dom.moduleMeta = $("#moduleMeta") || $("#modMeta");

    dom.tabCours = $("#tabCours") || $("#tab-cours") || $('[data-tab="cours"]');
    dom.tabQcm = $("#tabQcm") || $("#tab-qcm") || $('[data-tab="qcm"]');
    dom.tabCas = $("#tabCas") || $("#tab-cas") || $('[data-tab="cas"]');
    dom.btnRandom = $("#btnRandom") || $("#randomBtn") || $('[data-action="random"]');
    dom.inputSearch = $("#searchInput") || $("#inputSearch") || $("#search");

    dom.listContainer = $("#itemsList") || $("#listItems") || $("#cards");
    dom.emptyState = $("#emptyState") || $("#noResults");

    dom.readerModal = $("#readerModal") || $("#courseModal") || $("#modal");
    dom.readerClose = $("#readerClose") || $("#modalClose") || $('[data-action="close-reader"]');
    dom.readerMenu = $("#readerMenu") || $("#modalMenu") || $('[data-action="reader-menu"]');
    dom.readerBadgeLevel = $("#readerLevel") || $("#badgeLevel");
    dom.readerBadgeIndex = $("#readerIndex") || $("#badgeIndex");
    dom.readerTitle = $("#readerTitle") || $("#courseTitle");
    dom.readerTags = $("#readerTags") || $("#courseTags");
    dom.readerBody = $("#readerBody") || $("#courseBody") || $("#courseContent");
    dom.readerPrev = $("#readerPrev") || $("#btnPrev") || $('[data-action="prev"]');
    dom.readerNext = $("#readerNext") || $("#btnNext") || $('[data-action="next"]');
    dom.readerAudio = $("#readerAudio") || $("#btnAudio") || $('[data-action="audio"]');
  }

  function setOnlineBadge() {
    // optionnel : si tu as un badge
    const badge = $("#netBadge") || $("#onlineBadge") || $("#statusBadge");
    if (!badge) return;
    badge.textContent = state.online ? "En ligne" : "Hors ligne";
    badge.classList.toggle("offline", !state.online);
  }

  function showView(which) {
    // try hide/show sections safely
    const all = [dom.viewModules, dom.viewModule].filter(Boolean);
    for (const v of all) v.style.display = "none";

    if (which === "modules" && dom.viewModules) dom.viewModules.style.display = "";
    if (which === "module" && dom.viewModule) dom.viewModule.style.display = "";
  }

  /* ========= LOAD MODULES ========= */
  async function loadModules() {
    const index = await fetchJSON(DB_INDEX_PATH);
    // Format attendu: { modules: [ { id, title, sources:[...], ... } ] } OU tableau direct
    const modules = Array.isArray(index) ? index : index.modules || [];
    state.modules = modules.map((m, i) => ({
      id: m.id ?? `module_${i + 1}`,
      title: m.title ?? m.name ?? `Module ${i + 1}`,
      sources: m.sources ?? m.db ?? m.files ?? [],
      // Optionnel
      qcmSources: m.qcmSources ?? [],
      casSources: m.casSources ?? [],
      icon: m.icon ?? "📚",
      description: m.description ?? "",
    }));
    renderModules();
  }

  function renderModules() {
    if (!dom.modulesList) return;
    dom.modulesList.innerHTML = "";

    for (const mod of state.modules) {
      const card = document.createElement("div");
      card.className = "module-card";
      card.innerHTML = `
        <div class="module-left">
          <div class="module-title">${htmlEscape(mod.icon)} ${htmlEscape(mod.title)}</div>
          ${
            mod.description
              ? `<div class="module-desc">${htmlEscape(mod.description)}</div>`
              : ""
          }
          <div class="module-sources">${htmlEscape(
            (mod.sources || []).join(", ")
          )}</div>
        </div>
        <div class="module-right">
          <button class="btn btn-primary" data-open="${htmlEscape(mod.id)}">Ouvrir</button>
        </div>
      `;
      dom.modulesList.appendChild(card);
    }

    // listeners
    $$("[data-open]", dom.modulesList).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-open");
        openModule(id);
      });
    });
  }

  async function openModule(moduleId) {
    const mod = state.modules.find((m) => m.id === moduleId);
    if (!mod) {
      toast("Module introuvable.");
      return;
    }

    state.activeModule = mod;
    storage.set("fp_activeModuleId", mod.id);

    safeSetText("#moduleTitle", mod.title);
    if (dom.moduleMeta) {
      dom.moduleMeta.textContent = `Sources: ${(mod.sources || []).length}`;
    }

    showView("module");

    await loadModuleData(mod);
    setTab(storage.get("fp_activeTab", "cours"));
    applySearch(dom.inputSearch?.value ?? "");
    renderItems();
  }

  async function loadModuleData(mod) {
    // Sources: fichiers JSON variés. On “merge” tout ce qu’on trouve.
    const sources = Array.isArray(mod.sources) ? mod.sources : [];
    const allItems = [];

    for (const path of sources) {
      try {
        const json = await fetchJSON(path);
        // support: {cours:[], qcm:[], cas:[]} ou {items:[]} ou tableau direct
        if (Array.isArray(json)) {
          allItems.push(...json);
        } else if (json && typeof json === "object") {
          if (Array.isArray(json.cours)) allItems.push(...json.cours);
          if (Array.isArray(json.qcm)) allItems.push(...json.qcm);
          if (Array.isArray(json.cas)) allItems.push(...json.cas);
          if (Array.isArray(json.items)) allItems.push(...json.items);
          if (Array.isArray(json.data)) allItems.push(...json.data);
        }
      } catch (e) {
        console.warn("Erreur source:", path, e);
      }
    }

    // Normalisation
    const normalized = allItems
      .map((it, idx) => normalizeItem(it, idx))
      .filter(Boolean);

    state.data.cours = normalized.filter((x) => x.type === "cours");
    state.data.qcm = normalized.filter((x) => x.type === "qcm");
    state.data.cas = normalized.filter((x) => x.type === "cas");

    // Si un fichier n’indique pas type, on met par défaut cours
    if (state.data.cours.length === 0 && normalized.length > 0) {
      state.data.cours = normalized.map((x) => ({ ...x, type: "cours" }));
      state.data.qcm = [];
      state.data.cas = [];
    }

    // dédoublonnage
    state.data.cours = uniqBy(state.data.cours, (x) => x.id);
    state.data.qcm = uniqBy(state.data.qcm, (x) => x.id);
    state.data.cas = uniqBy(state.data.cas, (x) => x.id);

    // Compteurs
    const counters = $("#moduleCounters");
    if (counters) {
      counters.textContent = `Cours: ${state.data.cours.length} • QCM: ${state.data.qcm.length} • Cas: ${state.data.cas.length}`;
    }
  }

  function normalizeItem(it, idx) {
    if (!it) return null;

    // type
    let type = it.type || it.kind || it.category;
    type = (type || "cours").toString().toLowerCase();
    if (!["cours", "qcm", "cas"].includes(type)) type = "cours";

    // id
    const id = (it.id ?? it.uid ?? it.key ?? `${type}_${idx}_${Math.random().toString(16).slice(2)}`).toString();

    // titre
    const title = it.title ?? it.titre ?? it.question ?? it.name ?? "Sans titre";

    // niveau/tag
    const level = it.level ?? it.niveau ?? it.difficulty ?? "";
    const module = it.module ?? it.theme ?? "";
    const premium = !!(it.premium ?? it.isPremium ?? it.tagPremium);
    const tags = Array.isArray(it.tags) ? it.tags : [];

    // contenu
    const objective = it.objectif ?? it.objective ?? "";
    const explanation = it.explication ?? it.explanation ?? it.content ?? it.texte ?? "";
    const example = it.exemple ?? it.example ?? "";
    const takeaway = it.a_retenir ?? it.takeaway ?? it.resume ?? "";

    // QCM
    const choices = it.choices ?? it.options ?? it.reponses ?? null;
    const answer = it.answer ?? it.correct ?? it.solution ?? null;

    return {
      id,
      type,
      title,
      level: (level || "").toString(),
      module: (module || "").toString(),
      premium,
      tags,
      objective: (objective || "").toString(),
      explanation: (explanation || "").toString(),
      example: (example || "").toString(),
      takeaway: (takeaway || "").toString(),
      choices,
      answer,
      raw: it,
      _search: normalizeText(`${title} ${objective} ${explanation} ${example} ${takeaway} ${(tags || []).join(" ")} ${level} ${module}`),
    };
  }

  /* ========= TABS + SEARCH ========= */
  function setTab(tab) {
    tab = (tab || "cours").toString().toLowerCase();
    if (!["cours", "qcm", "cas"].includes(tab)) tab = "cours";
    state.activeTab = tab;
    storage.set("fp_activeTab", tab);

    // active UI
    const map = {
      cours: dom.tabCours,
      qcm: dom.tabQcm,
      cas: dom.tabCas,
    };
    Object.entries(map).forEach(([k, el]) => {
      if (!el) return;
      el.classList.toggle("active", k === tab);
    });

    renderItems();
  }

  function applySearch(q) {
    const query = normalizeText(q);
    const filter = (arr) => {
      if (!query) return arr.slice();
      return arr.filter((x) => x._search.includes(query));
    };

    state.filtered.cours = filter(state.data.cours);
    state.filtered.qcm = filter(state.data.qcm);
    state.filtered.cas = filter(state.data.cas);
  }

  function getActiveList() {
    return state.filtered[state.activeTab] || [];
  }

  /* ========= RENDER ITEMS ========= */
  function renderItems() {
    if (!dom.listContainer) return;

    const list = getActiveList();
    dom.listContainer.innerHTML = "";

    if (!list.length) {
      if (dom.emptyState) dom.emptyState.style.display = "";
      else toast("Aucun résultat.");
      return;
    }
    if (dom.emptyState) dom.emptyState.style.display = "none";

    for (const item of list) {
      const card = document.createElement("div");
      card.className = "item-card";
      const badges = [];
      if (item.level) badges.push(`<span class="badge">${htmlEscape(item.level)}</span>`);
      if (item.module) badges.push(`<span class="badge badge-soft">${htmlEscape(item.module)}</span>`);
      if (item.premium) badges.push(`<span class="badge badge-premium">📌 Cours premium</span>`);

      const excerpt = buildExcerpt(item);

      card.innerHTML = `
        <div class="item-head">
          <div class="item-title">${htmlEscape(item.title)}</div>
          <button class="btn btn-ghost" data-open-item="${htmlEscape(item.id)}">Ouvrir</button>
        </div>
        <div class="item-badges">${badges.join("")}</div>
        <div class="item-excerpt">${htmlEscape(excerpt)}</div>
      `;
      dom.listContainer.appendChild(card);
    }

    $$("[data-open-item]", dom.listContainer).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-open-item");
        openItemById(id);
      });
    });
  }

  function buildExcerpt(item) {
    if (item.type === "qcm") {
      return item.explanation || "QCM";
    }
    // cours/cas: montrer objectif + début explication
    const base = item.objective || item.explanation || "";
    const txt = base.replace(/\s+/g, " ").trim();
    if (!txt) return "";
    return txt.length > 140 ? txt.slice(0, 140) + "…" : txt;
  }

  function openItemById(id) {
    const list = getActiveList();
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) {
      toast("Contenu introuvable.");
      return;
    }

    if (state.activeTab === "cours" || state.activeTab === "cas") {
      openReader(list, idx);
      return;
    }

    // QCM : si tu as un lecteur QCM séparé, à brancher ici.
    // Pour éviter de casser, on affiche en "reader" simple.
    openReader(list, idx);
  }

  /* ========= READER ========= */
  function openReader(list, index) {
    state.reader.open = true;
    state.reader.list = list;
    state.reader.index = clamp(index, 0, list.length - 1);
    storage.set("fp_readerIndex", state.reader.index);

    if (dom.readerModal) dom.readerModal.style.display = "";
    renderReader();
  }

  function closeReader() {
    stopAudio();
    state.reader.open = false;
    if (dom.readerModal) dom.readerModal.style.display = "none";
  }

  function renderReader() {
    const list = state.reader.list || [];
    const item = list[state.reader.index];
    if (!item) return;

    // header badges
    if (dom.readerBadgeLevel) dom.readerBadgeLevel.textContent = item.level || "—";
    if (dom.readerBadgeIndex) dom.readerBadgeIndex.textContent = `${state.reader.index + 1}/${list.length}`;

    if (dom.readerTitle) dom.readerTitle.textContent = item.title;

    // tags
    if (dom.readerTags) {
      const tags = []
        .concat(item.level ? [item.level] : [])
        .concat(item.module ? [item.module] : [])
        .concat(item.premium ? ["Cours premium"] : [])
        .concat(Array.isArray(item.tags) ? item.tags : []);
      dom.readerTags.innerHTML = tags
        .filter(Boolean)
        .slice(0, 6)
        .map((t) => `<span class="badge">${htmlEscape(t)}</span>`)
        .join("");
    }

    // body
    const parts = [];

    if (item.objective) {
      parts.push(`
        <section class="reader-card">
          <div class="reader-h">OBJECTIF</div>
          <div class="reader-t">${formatText(item.objective)}</div>
        </section>
      `);
    }

    if (item.explanation) {
      parts.push(`
        <section class="reader-card">
          <div class="reader-h">EXPLICATION</div>
          <div class="reader-t">${formatText(item.explanation)}</div>
        </section>
      `);
    }

    if (item.example) {
      parts.push(`
        <section class="reader-card">
          <div class="reader-h">EXEMPLE</div>
          <div class="reader-t">${formatText(item.example)}</div>
        </section>
      `);
    }

    if (item.takeaway) {
      parts.push(`
        <section class="reader-card">
          <div class="reader-h">À RETENIR</div>
          <div class="reader-t">${formatText(item.takeaway)}</div>
        </section>
      `);
    }

    // QCM rendu simple
    if (item.type === "qcm" && item.choices) {
      const choices = Array.isArray(item.choices) ? item.choices : [];
      parts.push(`
        <section class="reader-card">
          <div class="reader-h">CHOISISSEZ</div>
          <div class="reader-t">
            ${choices
              .map((c, i) => `<div class="choice">${i + 1}) ${htmlEscape(c)}</div>`)
              .join("")}
          </div>
        </section>
      `);

      if (item.explanation) {
        parts.push(`
          <section class="reader-card">
            <div class="reader-h">EXPLICATION</div>
            <div class="reader-t">${formatText(item.explanation)}</div>
          </section>
        `);
      }
    }

    if (dom.readerBody) dom.readerBody.innerHTML = parts.join("");

    // buttons state
    if (dom.readerPrev) dom.readerPrev.disabled = state.reader.index <= 0;
    if (dom.readerNext) dom.readerNext.disabled = state.reader.index >= list.length - 1;

    updateAudioButtonUI();
  }

  function formatText(txt) {
    // Sécurisé + paragraphes
    const safe = htmlEscape(txt);
    // petits titres inline
    const withBreaks = safe
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\n/g, "<br>");
    return withBreaks;
  }

  function nextReader() {
    stopAudio();
    const list = state.reader.list || [];
    state.reader.index = clamp(state.reader.index + 1, 0, list.length - 1);
    storage.set("fp_readerIndex", state.reader.index);
    renderReader();
  }

  function prevReader() {
    stopAudio();
    const list = state.reader.list || [];
    state.reader.index = clamp(state.reader.index - 1, 0, list.length - 1);
    storage.set("fp_readerIndex", state.reader.index);
    renderReader();
  }

  /* ========= AUDIO ========= */
  function getSpeakTextForCurrent() {
    const item = (state.reader.list || [])[state.reader.index];
    if (!item) return "";
    const parts = [];
    parts.push(item.title ? `Titre : ${item.title}.` : "");
    if (item.objective) parts.push(`Objectif : ${item.objective}.`);
    if (item.explanation) parts.push(`Explication : ${item.explanation}.`);
    if (item.example) parts.push(`Exemple : ${item.example}.`);
    if (item.takeaway) parts.push(`À retenir : ${item.takeaway}.`);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function updateAudioButtonUI() {
    if (!dom.readerAudio) return;
    const on = state.reader.audio.playing;
    dom.readerAudio.classList.toggle("is-playing", on);
    dom.readerAudio.textContent = on ? "Stop" : "Audio";
  }

  function stopAudio() {
    // stop worker audio element
    const a = state.reader.audio.audioEl;
    if (a) {
      try {
        a.pause();
        a.src = "";
      } catch {}
    }
    state.reader.audio.audioEl = null;

    // revoke blob url
    if (state.reader.audio.objectUrl) {
      try {
        URL.revokeObjectURL(state.reader.audio.objectUrl);
      } catch {}
      state.reader.audio.objectUrl = null;
    }

    // stop speechSynthesis
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch {}

    state.reader.audio.playing = false;
    updateAudioButtonUI();
  }

  async function toggleAudio() {
    if (state.reader.audio.playing) {
      stopAudio();
      return;
    }

    const text = getSpeakTextForCurrent();
    if (!text) {
      toast("Rien à lire.");
      return;
    }

    // d’abord Worker (voix plus humaine)
    try {
      await playViaWorker(text);
      return;
    } catch (e) {
      console.warn("Worker audio failed:", e);
      // fallback téléphone
      try {
        await playViaSpeechSynthesis(text);
        return;
      } catch (e2) {
        console.warn("SpeechSynthesis failed:", e2);
        toast("Erreur audio.");
      }
    }
  }

  async function playViaWorker(text) {
    // POST vers ton Worker. On essaye 2 formats pour être compatible:
    // 1) { text: "...", format:"mp3" }
    // 2) { action:"tts", text:"..." }
    const payloads = [
      { text, format: "mp3" },
      { action: "tts", text, format: "mp3" },
    ];

    let lastErr = null;

    for (const body of payloads) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 20000);

        const res = await fetch(TTS_WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });

        clearTimeout(t);

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Worker HTTP ${res.status}: ${txt.slice(0, 160)}`);
        }

        const ct = (res.headers.get("content-type") || "").toLowerCase();
        // on accepte audio/* ou octet-stream
        if (!ct.includes("audio") && !ct.includes("octet-stream")) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Worker content-type invalide: ${ct} / ${txt.slice(0, 160)}`);
        }

        const buf = await res.arrayBuffer();
        if (!buf || buf.byteLength < 50) throw new Error("Audio vide.");

        const mime = ct.includes("audio") ? ct.split(";")[0] : "audio/mpeg";
        const blob = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(blob);

        const audio = new Audio();
        audio.src = url;
        audio.preload = "auto";

        state.reader.audio.audioEl = audio;
        state.reader.audio.objectUrl = url;
        state.reader.audio.playing = true;
        state.reader.audio.mode = "worker";
        updateAudioButtonUI();

        await audio.play();

        audio.onended = () => stopAudio();
        audio.onerror = () => {
          stopAudio();
          toast("Erreur audio.");
        };

        return;
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("Worker audio error");
  }

  async function playViaSpeechSynthesis(text) {
    if (!("speechSynthesis" in window)) throw new Error("speechSynthesis absent");
    // certaines ROM Android exigent interaction utilisateur -> on est dans un click, OK.
    state.reader.audio.playing = true;
    state.reader.audio.mode = "tts-fallback";
    updateAudioButtonUI();

    return new Promise((resolve, reject) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "fr-FR";
        // vitesse un peu plus “humaine”
        u.rate = 1.0;
        u.pitch = 1.0;

        u.onend = () => {
          stopAudio();
          resolve();
        };
        u.onerror = () => {
          stopAudio();
          reject(new Error("speech error"));
        };

        window.speechSynthesis.speak(u);
      } catch (e) {
        stopAudio();
        reject(e);
      }
    });
  }

  /* ========= RANDOM ========= */
  function openRandom() {
    const list = getActiveList();
    if (!list.length) return toast("Aucun contenu.");
    const idx = Math.floor(Math.random() * list.length);
    openItemById(list[idx].id);
  }

  /* ========= EVENTS ========= */
  function bindEvents() {
    // tabs
    if (dom.tabCours) dom.tabCours.addEventListener("click", () => setTab("cours"));
    if (dom.tabQcm) dom.tabQcm.addEventListener("click", () => setTab("qcm"));
    if (dom.tabCas) dom.tabCas.addEventListener("click", () => setTab("cas"));

    // random
    if (dom.btnRandom) dom.btnRandom.addEventListener("click", openRandom);

    // search
    if (dom.inputSearch) {
      dom.inputSearch.addEventListener("input", () => {
        applySearch(dom.inputSearch.value);
        renderItems();
      });
    }

    // reader
    if (dom.readerClose) dom.readerClose.addEventListener("click", closeReader);
    if (dom.readerPrev) dom.readerPrev.addEventListener("click", prevReader);
    if (dom.readerNext) dom.readerNext.addEventListener("click", nextReader);
    if (dom.readerAudio) dom.readerAudio.addEventListener("click", toggleAudio);

    // escape close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.reader.open) closeReader();
    });

    // online/offline
    window.addEventListener("online", () => {
      state.online = true;
      setOnlineBadge();
    });
    window.addEventListener("offline", () => {
      state.online = false;
      setOnlineBadge();
    });

    // si tu as un bouton “retour modules”
    const back = $("#backModules") || $('[data-action="back-modules"]');
    if (back) {
      back.addEventListener("click", () => {
        stopAudio();
        showView("modules");
      });
    }
  }

  /* ========= INIT ========= */
  async function init() {
    cacheDom();
    bindEvents();

    state.online = navigator.onLine;
    setOnlineBadge();

    // view initiale
    showView("modules");

    try {
      await loadModules();
    } catch (e) {
      console.error(e);
      toast("Erreur chargement modules.");
    }

    // reprendre dernier module si existant
    const lastId = storage.get("fp_activeModuleId", null);
    if (lastId) {
      // petite pause pour laisser le DOM respirer sur mobile
      await sleep(80);
      openModule(lastId).catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();