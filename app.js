/* app.js — FiscoPilot (DB TVA)
   - Charge db/tva.json
   - UI Modules / Cours / QCM / Cas
   - Recherche + Aléatoire
   - Lecteur leçon + navigation
   - Audio via Worker (POST { text })
*/

/** =========================
 *  CONFIG
 *  ========================= */
const DB_FILES = ["db/tva.json"];

// Mets ici l’URL de ton worker audio (TTS). Exemple:
// const AUDIO_WORKER_URL = "https://elevenapikey.marouane1341.workers.dev/";
//
// Si vide => l’app affiche "Audio pas branché..."
const AUDIO_WORKER_URL = ""; // <-- à remplir si tu veux l’audio

// Timeout fetch (ms)
const FETCH_TIMEOUT = 12000;

// Cache localStorage
const LS_KEY_DB = "fiscopilot_db_v1";

/** =========================
 *  UTILITAIRES
 *  ========================= */
function $(sel, root = document) {
  return root.querySelector(sel);
}
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
}
function safeText(s) {
  return (s ?? "").toString();
}
function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
function toast(msg) {
  // toast simple (fallback)
  alert(msg);
}
function nowCacheBuster() {
  return `cb=${Date.now()}`;
}
async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, cache: "no-store" });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/** =========================
 *  NORMALISATION DB
 *  ========================= */
function normalizePack(json, sourceName = "") {
  // ton format actuel: { meta, lessons, qcm, cases }
  const meta = json?.meta ?? { title: sourceName || "Module", version: 1 };
  const lessons = Array.isArray(json?.lessons) ? json.lessons : [];
  const qcm = Array.isArray(json?.qcm) ? json.qcm : [];
  const casesArr = Array.isArray(json?.cases) ? json.cases : [];

  return {
    meta: {
      title: safeText(meta.title || sourceName || "Module"),
      version: meta.version ?? 1,
    },
    lessons,
    qcm,
    cases: casesArr,
    _source: sourceName,
  };
}

function buildModuleFromPack(pack, id) {
  return {
    id,
    title: pack.meta.title,
    version: pack.meta.version,
    lessons: pack.lessons,
    qcm: pack.qcm,
    cases: pack.cases,
  };
}

/** =========================
 *  APP STATE
 *  ========================= */
const state = {
  modules: [],
  activeModuleId: null,
  activeTab: "lessons", // lessons | qcm | cases
  search: "",
  view: "modules", // modules | module | lesson | qcm | case
  lessonIndex: 0,
  qcmIndex: 0,
  caseIndex: 0,
  online: navigator.onLine,
};

/** =========================
 *  UI ROOT
 *  ========================= */
const root = (() => {
  let r = document.getElementById("app");
  if (!r) {
    r = document.createElement("div");
    r.id = "app";
    document.body.appendChild(r);
  }
  return r;
})();

/** =========================
 *  STYLES (minimal)
 *  ========================= */
(function injectBaseStyles() {
  const css = `
  :root { color-scheme: dark; }
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#081a2a; color:#eaf2ff; }
  a { color: inherit; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 14px; }
  .topbar { display:flex; align-items:center; gap:12px; padding: 14px; background: linear-gradient(180deg, rgba(11,45,78,.9), rgba(8,26,42,.4)); border-bottom:1px solid rgba(255,255,255,.08); position: sticky; top: 0; z-index: 10;}
  .brand { font-weight: 800; letter-spacing:.2px; }
  .pill { margin-left:auto; padding: 8px 12px; border-radius: 999px; background: rgba(18,75,112,.55); border:1px solid rgba(255,255,255,.08); font-weight:600; }
  .pill.off { background: rgba(120,30,30,.55); }
  .btn { border:1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color:#eaf2ff; padding: 10px 12px; border-radius: 14px; font-weight: 650; cursor:pointer; }
  .btn.primary { background: rgba(40,120,255,.25); border-color: rgba(40,120,255,.35); }
  .btn:active { transform: translateY(1px); }
  .row { display:flex; gap: 10px; flex-wrap: wrap; align-items:center; }
  .h1 { font-size: 44px; font-weight: 900; margin: 12px 0 6px; }
  .sub { opacity:.8; margin-bottom: 12px; }
  .card { background: rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius: 22px; padding: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.22); }
  .moduleCard { margin-top: 16px; }
  .tabs { display:flex; gap:10px; }
  .tab { flex: 1; padding: 12px; border-radius: 18px; text-align:center; background: rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); cursor:pointer; font-weight:750; }
  .tab.active { background: rgba(40,120,255,.25); border-color: rgba(40,120,255,.35); }
  .searchRow { display:flex; gap: 10px; margin-top: 10px; }
  .input { flex: 1; background: rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.12); color:#eaf2ff; padding: 12px 14px; border-radius: 16px; outline:none; }
  .list { display:flex; flex-direction: column; gap: 12px; margin-top: 12px; }
  .item { padding: 14px; border-radius: 18px; background: rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); cursor:pointer; }
  .itemTitle { font-weight: 900; font-size: 18px; margin-bottom: 6px; }
  .itemMeta { opacity:.85; font-size: 13px; display:flex; justify-content: space-between; gap: 10px; }
  .mono { white-space: pre-wrap; line-height: 1.42; }
  .footerNav { display:flex; gap: 10px; margin-top: 12px; }
  .muted { opacity:.75; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

/** =========================
 *  DATA LOADING
 *  ========================= */
async function loadDB() {
  // 1) tente fetch live
  const packs = [];
  for (const path of DB_FILES) {
    const url = `${path}?${nowCacheBuster()}`;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      packs.push(normalizePack(json, path));
    } catch (e) {
      console.warn("DB fetch failed:", path, e);
    }
  }

  if (packs.length) {
    const modules = packs.map((p, idx) => buildModuleFromPack(p, `mod_${idx + 1}`));
    state.modules = modules;

    // cache
    try {
      localStorage.setItem(LS_KEY_DB, JSON.stringify({ ts: Date.now(), modules }));
    } catch (_) {}

    return;
  }

  // 2) fallback cache local
  const cached = localStorage.getItem(LS_KEY_DB);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed?.modules)) {
        state.modules = parsed.modules;
        return;
      }
    } catch (_) {}
  }

  // 3) rien
  state.modules = [];
}

/** =========================
 *  ROUTING / HELPERS
 *  ========================= */
function getActiveModule() {
  return state.modules.find((m) => m.id === state.activeModuleId) || null;
}

function setView(view) {
  state.view = view;
  render();
}

function setOnlineBadge() {
  state.online = navigator.onLine;
  const badge = $("#onlineBadge");
  if (!badge) return;
  badge.textContent = state.online ? "En ligne" : "Hors ligne";
  badge.classList.toggle("off", !state.online);
}

/** =========================
 *  AUDIO (Worker)
 *  ========================= */
async function playAudioForText(text) {
  if (!AUDIO_WORKER_URL) {
    toast("Audio pas branché: ajoute l’URL du worker dans app.js (AUDIO_WORKER_URL).");
    return;
  }

  const payload = { text: safeText(text) };

  let res;
  try {
    res = await fetchWithTimeout(AUDIO_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    toast("Erreur réseau vers le worker audio.");
    return;
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    toast(`Erreur worker audio (${res.status}).\n${t.slice(0, 200)}`);
    return;
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const buf = await res.arrayBuffer();

  // Si le worker renvoie JSON d’erreur
  if (ct.includes("application/json")) {
    try {
      const j = JSON.parse(new TextDecoder().decode(buf));
      toast(`Worker: ${j?.detail?.message || j?.message || "Erreur"}`);
      return;
    } catch (_) {
      toast("Réponse audio invalide (JSON).");
      return;
    }
  }

  // Audio binaire
  const blob = new Blob([buf], { type: ct || "audio/mpeg" });
  const url = URL.createObjectURL(blob);

  const audio = new Audio();
  audio.src = url;
  audio.onended = () => URL.revokeObjectURL(url);
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    toast("Impossible de lire l’audio.");
  };

  try {
    await audio.play();
  } catch (e) {
    toast("Appuie sur un bouton 'Audio' (interaction requise) puis réessaie.");
  }
}

/** =========================
 *  RENDER
 *  ========================= */
function render() {
  root.innerHTML = "";

  const top = el("div", { class: "topbar" }, [
    el("button", {
      class: "btn",
      onClick: () => {
        if (state.view === "modules") return;
        // back logic
        if (state.view === "lesson" || state.view === "qcm" || state.view === "case") {
          setView("module");
        } else {
          setView("modules");
        }
      },
    }, [document.createTextNode("☰")]),
    el("div", { class: "brand" }, [document.createTextNode("FiscoPilot AI ELITE MAX 🇧🇪")]),
    el("div", { id: "onlineBadge", class: "pill" }, [document.createTextNode(state.online ? "En ligne" : "Hors ligne")]),
  ]);

  const wrap = el("div", { class: "wrap" }, []);

  root.append(top, wrap);

  if (state.view === "modules") renderModules(wrap);
  else if (state.view === "module") renderModule(wrap);
  else if (state.view === "lesson") renderLesson(wrap);
  else if (state.view === "qcm") renderQcm(wrap);
  else if (state.view === "case") renderCase(wrap);

  setOnlineBadge();
}

function renderModules(wrap) {
  wrap.append(
    el("div", { class: "h1" }, [document.createTextNode("Modules")]),
    el("div", { class: "sub" }, [
      document.createTextNode("Choisis un module. Cours + QCM + Cas, recherche et aléatoire."),
    ])
  );

  if (!state.modules.length) {
    wrap.append(
      el("div", { class: "card" }, [
        el("div", { class: "itemTitle" }, [document.createTextNode("Aucune base chargée")]),
        el("div", { class: "muted" }, [
          document.createTextNode("Vérifie que db/tva.json existe et qu’il est accessible via GitHub Pages."),
        ]),
        el("div", { class: "footerNav" }, [
          el("button", { class: "btn primary", onClick: async () => { await loadDB(); render(); } }, [
            document.createTextNode("Recharger"),
          ]),
        ]),
      ])
    );
    return;
  }

  state.modules.forEach((m) => {
    const counts = `Cours: ${m.lessons.length} • QCM: ${m.qcm.length} • Cas: ${m.cases.length}`;
    const card = el("div", { class: "card moduleCard" }, [
      el("div", { class: "row" }, [
        el("div", { class: "itemTitle" }, [document.createTextNode("📚 " + m.title)]),
        el("div", { class: "muted", style: "margin-left:auto" }, [document.createTextNode(`v${m.version}`)]),
      ]),
      el("div", { class: "tabs", style: "margin-top:10px" }, [
        el("button", { class: "tab active", onClick: () => openModule(m.id, "lessons") }, [
          document.createTextNode("📘 Cours"),
        ]),
        el("button", { class: "tab", onClick: () => openModule(m.id, "qcm") }, [
          document.createTextNode("🧪 QCM"),
        ]),
        el("button", { class: "tab", onClick: () => openModule(m.id, "cases") }, [
          document.createTextNode("🧾 Cas"),
        ]),
      ]),
      el("div", { class: "searchRow" }, [
        el("input", {
          class: "input",
          placeholder: "Rechercher (ex: prorata, facture, 4L...)",
          value: state.search,
          onInput: debounce((e) => {
            state.search = e.target.value || "";
          }, 150),
        }),
        el("button", { class: "btn primary", onClick: () => openRandomFromModule(m.id) }, [
          document.createTextNode("Aléatoire"),
        ]),
      ]),
      el("div", { class: "muted", style: "margin-top:10px" }, [document.createTextNode(counts)]),
    ]);

    wrap.append(card);
  });
}

function openModule(moduleId, tab) {
  state.activeModuleId = moduleId;
  state.activeTab = tab;
  setView("module");
}

function openRandomFromModule(moduleId) {
  state.activeModuleId = moduleId;
  const mod = getActiveModule();
  if (!mod) return;

  // prend dans lessons par défaut si possible sinon qcm sinon cases
  const pools = [];
  if (mod.lessons.length) pools.push({ type: "lesson", n: mod.lessons.length });
  if (mod.qcm.length) pools.push({ type: "qcm", n: mod.qcm.length });
  if (mod.cases.length) pools.push({ type: "case", n: mod.cases.length });

  if (!pools.length) {
    toast("Aucun contenu dans ce module.");
    return;
  }

  const pickPool = pools[Math.floor(Math.random() * pools.length)];
  const idx = Math.floor(Math.random() * pickPool.n);

  if (pickPool.type === "lesson") {
    state.lessonIndex = idx;
    setView("lesson");
  } else if (pickPool.type === "qcm") {
    state.qcmIndex = idx;
    setView("qcm");
  } else {
    state.caseIndex = idx;
    setView("case");
  }
}

function renderModule(wrap) {
  const mod = getActiveModule();
  if (!mod) {
    setView("modules");
    return;
  }

  wrap.append(
    el("div", { class: "h1", style: "font-size:34px" }, [document.createTextNode(mod.title)]),
    el("div", { class: "sub" }, [
      document.createTextNode(
        `Cours: ${mod.lessons.length} • QCM: ${mod.qcm.length} • Cas: ${mod.cases.length}`
      ),
    ])
  );

  const tabs = el("div", { class: "tabs" }, [
    el("button", {
      class: "tab " + (state.activeTab === "lessons" ? "active" : ""),
      onClick: () => { state.activeTab = "lessons"; render(); },
    }, [document.createTextNode("📘 Cours")]),
    el("button", {
      class: "tab " + (state.activeTab === "qcm" ? "active" : ""),
      onClick: () => { state.activeTab = "qcm"; render(); },
    }, [document.createTextNode("🧪 QCM")]),
    el("button", {
      class: "tab " + (state.activeTab === "cases" ? "active" : ""),
      onClick: () => { state.activeTab = "cases"; render(); },
    }, [document.createTextNode("🧾 Cas")]),
  ]);

  const searchRow = el("div", { class: "searchRow" }, [
    el("input", {
      class: "input",
      placeholder: "Rechercher (ex: prorata, facture, 4L...)",
      value: state.search,
      onInput: debounce((e) => {
        state.search = e.target.value || "";
        render();
      }, 150),
    }),
    el("button", { class: "btn primary", onClick: () => openRandomFromModule(mod.id) }, [
      document.createTextNode("Aléatoire"),
    ]),
  ]);

  wrap.append(tabs, searchRow);

  const q = state.search.trim().toLowerCase();
  let items = [];
  if (state.activeTab === "lessons") items = mod.lessons.map((x, i) => ({ ...x, _i: i }));
  if (state.activeTab === "qcm") items = mod.qcm.map((x, i) => ({ ...x, _i: i }));
  if (state.activeTab === "cases") items = mod.cases.map((x, i) => ({ ...x, _i: i }));

  if (q) {
    items = items.filter((x) => {
      const hay = [
        x.id,
        x.title,
        x.question,
        x.text,
        x.answer_md,
        (x.choices || []).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const list = el("div", { class: "list" }, []);
  if (!items.length) {
    list.append(el("div", { class: "muted" }, [document.createTextNode("Aucun résultat.")] ));
  } else {
    items.forEach((it) => {
      const title =
        state.activeTab === "lessons" ? it.title :
        state.activeTab === "qcm" ? it.question :
        it.title;

      const level =
        it.level ? safeText(it.level) :
        state.activeTab === "qcm" ? safeText(it.level || "") :
        "";

      const snippet =
        state.activeTab === "lessons" ? safeText(it.text).slice(0, 120) :
        state.activeTab === "qcm" ? safeText(it.explain || "").slice(0, 120) :
        safeText(it.question || "").slice(0, 120);

      const itemNode = el("div", {
        class: "item",
        onClick: () => {
          if (state.activeTab === "lessons") {
            state.lessonIndex = it._i;
            setView("lesson");
          } else if (state.activeTab === "qcm") {
            state.qcmIndex = it._i;
            setView("qcm");
          } else {
            state.caseIndex = it._i;
            setView("case");
          }
        },
      }, [
        el("div", { class: "itemTitle" }, [document.createTextNode(title || "Sans titre")]),
        el("div", { class: "muted" }, [document.createTextNode(snippet + (snippet.length >= 120 ? "…" : ""))]),
        el("div", { class: "itemMeta" }, [
          el("span", {}, [document.createTextNode(level)]),
          el("span", { class: "muted" }, [document.createTextNode(state.activeTab === "lessons" ? `ID: ${it.id}` : "")]),
        ]),
      ]);
      list.append(itemNode);
    });
  }

  wrap.append(list);
}

function renderLesson(wrap) {
  const mod = getActiveModule();
  if (!mod) return setView("modules");
  const lesson = mod.lessons[state.lessonIndex];
  if (!lesson) return setView("module");

  wrap.append(
    el("div", { class: "h1", style: "font-size:34px" }, [document.createTextNode(lesson.title || "Cours")]),
    el("div", { class: "sub" }, [document.createTextNode(`${lesson.level || ""} • ID: ${lesson.id || ""}`)]),
    el("div", { class: "card mono" }, [document.createTextNode(lesson.text || "")])
  );

  const footer = el("div", { class: "footerNav" }, [
    el("button", {
      class: "btn",
      onClick: () => {
        state.lessonIndex = Math.max(0, state.lessonIndex - 1);
        render();
      },
      disabled: state.lessonIndex <= 0 ? "true" : null,
    }, [document.createTextNode("Précédent")]),
    el("button", {
      class: "btn primary",
      onClick: async () => {
        // audio basé sur le texte entier
        const t = `${lesson.title}\n\n${lesson.text || ""}`;
        await playAudioForText(t);
      },
    }, [document.createTextNode("🔊 Audio")]),
    el("button", {
      class: "btn",
      onClick: () => {
        state.lessonIndex = Math.min(mod.lessons.length - 1, state.lessonIndex + 1);
        render();
      },
      disabled: state.lessonIndex >= mod.lessons.length - 1 ? "true" : null,
    }, [document.createTextNode("Suivant")]),
  ]);

  wrap.append(footer);

  wrap.append(
    el("div", { class: "muted", style: "margin-top:10px" }, [
      document.createTextNode(
        `Audio: ${AUDIO_WORKER_URL ? "prêt" : "pas branché (il manque l’URL du worker)."}`
      ),
    ])
  );
}

function renderQcm(wrap) {
  const mod = getActiveModule();
  if (!mod) return setView("modules");
  const q = mod.qcm[state.qcmIndex];
  if (!q) return setView("module");

  wrap.append(
    el("div", { class: "h1", style: "font-size:32px" }, [document.createTextNode("QCM")]),
    el("div", { class: "sub" }, [document.createTextNode(q.level ? `Niveau: ${q.level}` : "")]),
    el("div", { class: "card" }, [
      el("div", { class: "itemTitle" }, [document.createTextNode(q.question || "Question")]),
      el("div", { class: "list" }, [
        ...(Array.isArray(q.choices) ? q.choices : []).map((c, idx) =>
          el("div", {
            class: "item",
            onClick: () => {
              const ok = idx === q.answer;
              toast(ok ? "✅ Bonne réponse" : "❌ Mauvaise réponse");
            },
          }, [
            el("div", {}, [document.createTextNode(`${idx + 1}) ${c}`)]),
          ])
        ),
      ]),
      el("div", { class: "muted", style: "margin-top:10px" }, [
        document.createTextNode(q.explain ? `Explication: ${q.explain}` : ""),
      ]),
    ])
  );

  const footer = el("div", { class: "footerNav" }, [
    el("button", {
      class: "btn",
      onClick: () => { state.qcmIndex = Math.max(0, state.qcmIndex - 1); render(); },
      disabled: state.qcmIndex <= 0 ? "true" : null,
    }, [document.createTextNode("Précédent")]),
    el("button", {
      class: "btn primary",
      onClick: () => openRandomFromModule(mod.id),
    }, [document.createTextNode("Aléatoire")]),
    el("button", {
      class: "btn",
      onClick: () => { state.qcmIndex = Math.min(mod.qcm.length - 1, state.qcmIndex + 1); render(); },
      disabled: state.qcmIndex >= mod.qcm.length - 1 ? "true" : null,
    }, [document.createTextNode("Suivant")]),
  ]);
  wrap.append(footer);
}

function renderCase(wrap) {
  const mod = getActiveModule();
  if (!mod) return setView("modules");
  const c = mod.cases[state.caseIndex];
  if (!c) return setView("module");

  wrap.append(
    el("div", { class: "h1", style: "font-size:32px" }, [document.createTextNode("Cas")]),
    el("div", { class: "sub" }, [document.createTextNode(c.level ? `Niveau: ${c.level}` : "")]),
    el("div", { class: "card" }, [
      el("div", { class: "itemTitle" }, [document.createTextNode(c.title || "Cas pratique")]),
      el("div", { class: "mono", style: "margin-top:10px" }, [document.createTextNode(c.question || "")]),
      el("div", { class: "mono muted", style: "margin-top:14px" }, [
        document.createTextNode("Réponse:"),
      ]),
      el("div", { class: "mono", style: "margin-top:6px" }, [
        document.createTextNode(c.answer_md || ""),
      ]),
    ])
  );

  const footer = el("div", { class: "footerNav" }, [
    el("button", {
      class: "btn",
      onClick: () => { state.caseIndex = Math.max(0, state.caseIndex - 1); render(); },
      disabled: state.caseIndex <= 0 ? "true" : null,
    }, [document.createTextNode("Précédent")]),
    el("button", {
      class: "btn primary",
      onClick: () => openRandomFromModule(mod.id),
    }, [document.createTextNode("Aléatoire")]),
    el("button", {
      class: "btn",
      onClick: () => { state.caseIndex = Math.min(mod.cases.length - 1, state.caseIndex + 1); render(); },
      disabled: state.caseIndex >= mod.cases.length - 1 ? "true" : null,
    }, [document.createTextNode("Suivant")]),
  ]);
  wrap.append(footer);
}

/** =========================
 *  BOOT
 *  ========================= */
async function boot() {
  window.addEventListener("online", () => { setOnlineBadge(); });
  window.addEventListener("offline", () => { setOnlineBadge(); });

  await loadDB();

  // Si 1 seul module, on reste sur Modules (comme ta UI)
  setView("modules");
}

boot();