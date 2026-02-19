
/* =========================
   FiscoPilot — app.js (FULL)
   Build 36 — Premium + Audio TTS
   ========================= */

const APP_BUILD = 36;
const DB_INDEX = "./db_index.json"; // ton index modules
const $ = (id) => document.getElementById(id);

const state = {
  modules: [],
  activeModule: null,
  lessons: [],
  qcm: [],
  cases: [],
  view: "modules", // modules | module
  tab: "lessons",  // lessons | qcm | cases
  query: "",
  modalList: [],   // liste courante affichée dans modal (ex: lessons)
  modalType: "",   // lessons|qcm|cases
  modalIndex: 0
};

/* -------------------------
   PWA / network status
-------------------------- */
function setNetPill() {
  const pill = $("netPill");
  const online = navigator.onLine;
  pill.textContent = online ? "En ligne" : "Hors ligne";
  pill.classList.toggle("online", online);
  pill.classList.toggle("offline", !online);
}
window.addEventListener("online", setNetPill);
window.addEventListener("offline", setNetPill);

/* -------------------------
   Service worker register
-------------------------- */
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (e) {
    console.warn("SW register failed:", e);
  }
}

/* -------------------------
   Helpers
-------------------------- */
function escapeHtml(s) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function levelDot(levelText) {
  const t = (levelText || "").toLowerCase();
  if (t.includes("début") || t.includes("🟢")) return "badge";
  if (t.includes("inter") || t.includes("🟡")) return "badge warn";
  if (t.includes("avancé") || t.includes("🟠")) return "badge warn";
  if (t.includes("expert") || t.includes("🔴")) return "badge red";
  return "badge";
}

function normalizeLevel(levelText) {
  return levelText || "Niveau";
}

/* Transforme le texte d’un cours en blocs premium (OBJECTIF / EXPLICATION / EXEMPLE / À RETENIR / MINI-EXO) */
function buildLessonBlocks(rawText) {
  const text = (rawText || "").trim();

  // Si le cours contient déjà des sections, on les exploite.
  // Sinon on fait une mise en forme simple.
  const markers = ["OBJECTIF", "EXPLICATION", "EXEMPLE", "À RETENIR", "A RETENIR", "MINI-EXO", "MINI EXO"];
  const hasMarker = markers.some(m => text.toUpperCase().includes(m));

  if (!hasMarker) {
    return [
      { title: "EXPLICATION", html: `<div class="lessonText">${escapeHtml(text).replaceAll("\n", "<br>")}</div>` }
    ];
  }

  // Split naïf par titres connus
  // On injecte des titres si présents.
  const lines = text.split("\n");
  const sections = [];
  let current = { title: "EXPLICATION", body: [] };

  function pushCurrent() {
    const body = current.body.join("\n").trim();
    if (!body) return;
    sections.push({
      title: current.title,
      html: current.title.includes("EXEMPLE")
        ? `<div class="codeBox">${escapeHtml(body).replaceAll("\n", "<br>")}</div>`
        : `<div class="lessonText">${escapeHtml(body).replaceAll("\n", "<br>")}</div>`
    });
  }

  for (const line of lines) {
    const up = line.trim().toUpperCase();
    const isTitle = markers.includes(up);
    if (isTitle) {
      pushCurrent();
      current = { title: up === "A RETENIR" ? "À RETENIR" : line.trim().toUpperCase(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  pushCurrent();
  return sections;
}

function renderTopIntro(title, subtitle) {
  return `
    <div class="card">
      <div class="sectionTitle">${escapeHtml(title)}</div>
      <div class="muted">${escapeHtml(subtitle)}</div>
    </div>
  `;
}

/* -------------------------
   Data loading
-------------------------- */
async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function loadIndex() {
  const idx = await fetchJson(DB_INDEX);
  state.modules = idx.modules || [];
}

async function loadModule(mod) {
  state.activeModule = mod;

  const sources = mod.sources || [];
  const merged = { lessons: [], qcm: [], cases: [] };

  for (const src of sources) {
    const data = await fetchJson(src);
    merged.lessons.push(...(data.lessons || []));
    merged.qcm.push(...(data.qcm || []));
    merged.cases.push(...(data.cases || []));
  }

  state.lessons = merged.lessons;
  state.qcm = merged.qcm;
  state.cases = merged.cases;
}

/* -------------------------
   UI render
-------------------------- */
function render() {
  const app = $("app");

  if (state.view === "modules") {
    app.innerHTML = `
      ${renderTopIntro("Modules", "Choisis un module. Les cours premium ont un objectif, une explication claire, des exemples et “à retenir”.")}
      ${state.modules.map(m => `
        <div class="card">
          <div class="row" style="justify-content:space-between;">
            <div>
              <div class="sectionTitle">📚 ${escapeHtml(m.title || m.id)}</div>
              <div class="muted">Sources: ${(m.sources||[]).map(escapeHtml).join(", ")}</div>
            </div>
            <button class="btn primary small" data-open-module="${escapeHtml(m.id)}">Ouvrir</button>
          </div>
        </div>
      `).join("")}
    `;
    bindModules();
    return;
  }

  // module view
  const mod = state.activeModule;
  const counts = `Cours: ${state.lessons.length} • QCM: ${state.qcm.length} • Cas: ${state.cases.length}`;

  app.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:flex-start;">
        <div>
          <div class="sectionTitle">📘 ${escapeHtml(mod.title || mod.id)}</div>
          <div class="muted">${escapeHtml(counts)}</div>
          <div class="muted">Sources: ${(mod.sources||[]).map(escapeHtml).join(", ")}</div>
        </div>
        <button class="btn ghost small" id="btnBackModules">← Retour</button>
      </div>

      <div class="tabs">
        <button class="tab ${state.tab==="lessons"?"active":""}" data-tab="lessons">📘 Cours</button>
        <button class="tab ${state.tab==="qcm"?"active":""}" data-tab="qcm">🧪 QCM</button>
        <button class="tab ${state.tab==="cases"?"active":""}" data-tab="cases">🧾 Cas</button>
      </div>

      <div class="searchRow">
        <input class="input" id="searchInput" placeholder="Rechercher (ex: prorata, facture, intracom)" value="${escapeHtml(state.query)}" />
        <button class="btn primary" id="btnRandom">Aléatoire</button>
      </div>
    </div>

    <div id="listArea"></div>
  `;

  $("btnBackModules").onclick = () => {
    state.view = "modules";
    state.tab = "lessons";
    state.query = "";
    render();
  };

  // tabs
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.onclick = () => {
      state.tab = btn.getAttribute("data-tab");
      state.query = "";
      render();
    };
  });

  // search
  const si = $("searchInput");
  si.oninput = () => {
    state.query = si.value || "";
    renderList();
  };

  $("btnRandom").onclick = () => {
    const list = getCurrentListFiltered();
    if (!list.length) return;
    const i = Math.floor(Math.random() * list.length);
    openModal(state.tab, list, i);
  };

  renderList();
}

function getCurrentListFiltered() {
  const q = (state.query || "").trim().toLowerCase();
  let list = [];
  if (state.tab === "lessons") list = state.lessons;
  if (state.tab === "qcm") list = state.qcm;
  if (state.tab === "cases") list = state.cases;

  if (!q) return list;

  return list.filter(item => {
    const hay = JSON.stringify(item).toLowerCase();
    return hay.includes(q);
  });
}

function renderList() {
  const area = document.getElementById("listArea");
  const list = getCurrentListFiltered();

  if (state.tab === "lessons") {
    area.innerHTML = list.map((l, idx) => {
      const level = l.level || "Débutant";
      const badgeClass = levelDot(level);
      const snippet = (l.text || "").trim().slice(0, 170);
      return `
        <div class="item">
          <div class="itemTop">
            <div style="min-width:0;">
              <div class="itemTitle">${escapeHtml(l.title || `Cours ${idx+1}`)}</div>
              <div class="badges">
                <span class="${badgeClass}"><span class="dot"></span>${escapeHtml(level.replace("🟢","").replace("🟡","").replace("🟠","").replace("🔴","").trim() || "Niveau")}</span>
                <span class="badge pin">📌 Cours premium</span>
              </div>
            </div>
            <button class="btn ghost small" data-open="lessons" data-index="${idx}">Ouvrir</button>
          </div>
          <div class="muted" style="margin-top:10px; line-height:1.45;">
            ${escapeHtml(snippet)}${(l.text||"").length>170 ? "…" : ""}
          </div>
        </div>
      `;
    }).join("");

  } else if (state.tab === "qcm") {
    area.innerHTML = list.map((q, idx) => {
      const level = q.level || "🟢";
      const badgeClass = levelDot(level);
      return `
        <div class="item">
          <div class="itemTop">
            <div style="min-width:0;">
              <div class="itemTitle">${escapeHtml(q.question || `QCM ${idx+1}`)}</div>
              <div class="badges">
                <span class="${badgeClass}"><span class="dot"></span>${escapeHtml(level)}</span>
              </div>
            </div>
            <button class="btn ghost small" data-open="qcm" data-index="${idx}">Ouvrir</button>
          </div>
        </div>
      `;
    }).join("");

  } else {
    area.innerHTML = list.map((c, idx) => {
      const level = c.level || "🟢";
      const badgeClass = levelDot(level);
      return `
        <div class="item">
          <div class="itemTop">
            <div style="min-width:0;">
              <div class="itemTitle">${escapeHtml(c.title || `Cas ${idx+1}`)}</div>
              <div class="badges">
                <span class="${badgeClass}"><span class="dot"></span>${escapeHtml(level)}</span>
              </div>
            </div>
            <button class="btn ghost small" data-open="cases" data-index="${idx}">Ouvrir</button>
          </div>
          <div class="muted" style="margin-top:10px;">${escapeHtml((c.question||"").slice(0,160))}${(c.question||"").length>160?"…":""}</div>
        </div>
      `;
    }).join("");
  }

  // bind open
  document.querySelectorAll("[data-open]").forEach(btn => {
    btn.onclick = () => {
      const type = btn.getAttribute("data-open");
      const originalIndex = Number(btn.getAttribute("data-index"));
      const fullList = getCurrentListFiltered(); // list affichée
      openModal(type, fullList, originalIndex);
    };
  });
}

/* -------------------------
   Modules binding
-------------------------- */
function bindModules() {
  document.querySelectorAll("[data-open-module]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-open-module");
      const mod = state.modules.find(m => m.id === id) || state.modules[0];
      await loadModule(mod);
      state.view = "module";
      state.tab = "lessons";
      state.query = "";
      render();
    };
  });
}

/* -------------------------
   Drawer (menu)
-------------------------- */
function openDrawer() {
  $("drawer").setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  $("drawer").setAttribute("aria-hidden", "true");
}
function bindDrawer() {
  $("btnMenu").onclick = openDrawer;
  $("btnClose").onclick = closeDrawer;

  $("navToModules").onclick = () => {
    closeDrawer();
    state.view = "modules";
    render();
  };

  $("navForceRefresh").onclick = async () => {
    closeDrawer();
    await forceRefresh();
  };

  // close on backdrop click (outside)
  $("drawer").addEventListener("click", (e) => {
    if (e.target === $("drawer")) closeDrawer();
  });
}

/* -------------------------
   Force refresh (clear caches + SW)
-------------------------- */
async function forceRefresh() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) {
    console.warn("forceRefresh error", e);
  } finally {
    // hard reload with cache-bust
    const url = new URL(location.href);
    url.searchParams.set("r", String(Date.now()));
    location.href = url.toString();
  }
}

/* -------------------------
   Modal + Audio (TTS)
-------------------------- */
function openModal(type, list, index) {
  state.modalType = type;
  state.modalList = list;
  state.modalIndex = index;

  $("modal").setAttribute("aria-hidden", "false");
  renderModal();
}

function closeModal() {
  stopSpeak();
  $("modal").setAttribute("aria-hidden", "true");
}

function renderModal() {
  const list = state.modalList;
  const i = Math.max(0, Math.min(state.modalIndex, list.length - 1));
  state.modalIndex = i;

  $("modalPos").textContent = `${i + 1}/${list.length}`;

  const item = list[i];

  let level = "Niveau";
  let bodyHtml = "";

  if (state.modalType === "lessons") {
    level = normalizeLevel(item.level || "Débutant");
    $("modalLevel").textContent = level;

    const blocks = buildLessonBlocks(item.text || "");
    bodyHtml = `
      <div class="lessonBlock">
        <h2 class="itemTitle" style="margin:0 0 10px;">${escapeHtml(item.title || "Cours")}</h2>
        <div class="badges">
          <span class="${levelDot(level)}"><span class="dot"></span>${escapeHtml(level)}</span>
          <span class="badge pin">📌 Cours premium</span>
        </div>
      </div>
      ${blocks.map(b => `
        <div class="lessonBlock">
          <h3>${escapeHtml(b.title)}</h3>
          ${b.html}
        </div>
      `).join("")}
    `;
  }

  if (state.modalType === "qcm") {
    level = normalizeLevel(item.level || "🟢");
    $("modalLevel").textContent = level;

    const choices = item.choices || [];
    bodyHtml = `
      <div class="lessonBlock">
        <h2 class="itemTitle" style="margin:0 0 10px;">${escapeHtml(item.question || "QCM")}</h2>
        <div class="badges">
          <span class="${levelDot(level)}"><span class="dot"></span>${escapeHtml(level)}</span>
        </div>
      </div>

      <div class="lessonBlock">
        <h3>CHOIX</h3>
        <div class="lessonText">
          ${choices.map((c, idx) => `
            <div style="margin:10px 0;">
              <button class="btn ghost small" style="width:100%; text-align:left;"
                data-choice="${idx}">${idx+1}. ${escapeHtml(c)}</button>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="lessonBlock" id="qcmExplain" style="display:none;">
        <h3>EXPLICATION</h3>
        <div class="lessonText" id="qcmExplainText"></div>
      </div>
    `;
  }

  if (state.modalType === "cases") {
    level = normalizeLevel(item.level || "🟢");
    $("modalLevel").textContent = level;

    bodyHtml = `
      <div class="lessonBlock">
        <h2 class="itemTitle" style="margin:0 0 10px;">${escapeHtml(item.title || "Cas")}</h2>
        <div class="badges">
          <span class="${levelDot(level)}"><span class="dot"></span>${escapeHtml(level)}</span>
        </div>
      </div>

      <div class="lessonBlock">
        <h3>QUESTION</h3>
        <div class="lessonText">${escapeHtml(item.question || "").replaceAll("\n","<br>")}</div>
      </div>

      <div class="lessonBlock">
        <h3>RÉPONSE (corrigé)</h3>
        <div class="codeBox">${escapeHtml(item.answer_md || item.answer || "").replaceAll("\n","<br>")}</div>
      </div>
    `;
  }

  $("modalBody").innerHTML = bodyHtml;

  // bind qcm choices
  if (state.modalType === "qcm") {
    document.querySelectorAll("[data-choice]").forEach(btn => {
      btn.onclick = () => {
        const picked = Number(btn.getAttribute("data-choice"));
        const ans = item.answer;
        const ok = (picked === ans);

        const exp = item.explain || "";
        const box = document.getElementById("qcmExplain");
        const txt = document.getElementById("qcmExplainText");
        box.style.display = "block";
        txt.innerHTML =
          `<b>${ok ? "✅ Bonne réponse" : "❌ Mauvaise réponse"}</b><br>` +
          `Réponse attendue : <b>${(ans+1)}.</b> ${escapeHtml((item.choices||[])[ans]||"")}<br><br>` +
          `${escapeHtml(exp).replaceAll("\n","<br>")}`;
      };
    });
  }
}

/* Prev/Next + modal buttons */
function bindModal() {
  $("modalClose").onclick = closeModal;
  $("modalMenu").onclick = openDrawer;

  $("prevBtn").onclick = () => {
    stopSpeak();
    state.modalIndex = Math.max(0, state.modalIndex - 1);
    renderModal();
  };
  $("nextBtn").onclick = () => {
    stopSpeak();
    state.modalIndex = Math.min(state.modalList.length - 1, state.modalIndex + 1);
    renderModal();
  };

  // close by clicking outside sheet
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });

  // keyboard (desktop)
  window.addEventListener("keydown", (e) => {
    if ($("modal").getAttribute("aria-hidden") === "true") return;
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowLeft") $("prevBtn").click();
    if (e.key === "ArrowRight") $("nextBtn").click();
  });

  // TTS controls
  $("ttsPlay").onclick = () => speakCurrent();
  $("ttsPause").onclick = () => togglePause();
  $("ttsStop").onclick = () => stopSpeak();
}

/* -------------------------
   TTS (Web Speech API)
   Option 1: meilleur possible sans serveur
-------------------------- */
let ttsUtter = null;

function getReadableTextFromModal() {
  // Prend le contenu visible du modalBody (texte propre)
  const el = $("modalBody");
  const txt = (el.innerText || "").trim();
  // On évite de lire trop de trucs UI
  return txt.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function pickFrenchVoice() {
  const voices = speechSynthesis.getVoices() || [];
  // priorité fr-BE / fr-FR
  return (
    voices.find(v => /fr-BE/i.test(v.lang)) ||
    voices.find(v => /fr-FR/i.test(v.lang)) ||
    voices.find(v => /fr/i.test(v.lang)) ||
    null
  );
}

function speakCurrent() {
  if (!("speechSynthesis" in window)) {
    alert("Audio non supporté sur ce navigateur.");
    return;
  }
  stopSpeak();

  const text = getReadableTextFromModal();
  if (!text) return;

  ttsUtter = new SpeechSynthesisUtterance(text);

  const voice = pickFrenchVoice();
  if (voice) ttsUtter.voice = voice;

  // Réglages “plus humains” (souvent mieux sur Android)
  ttsUtter.lang = (voice && voice.lang) ? voice.lang : "fr-FR";
  ttsUtter.rate = 0.95;
  ttsUtter.pitch = 1.0;
  ttsUtter.volume = 1.0;

  speechSynthesis.speak(ttsUtter);
}

function togglePause() {
  if (!("speechSynthesis" in window)) return;
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause();
  } else if (speechSynthesis.paused) {
    speechSynthesis.resume();
  }
}

function stopSpeak() {
  if (!("speechSynthesis" in window)) return;
  try { speechSynthesis.cancel(); } catch {}
  ttsUtter = null;
}

/* -------------------------
   Boot
-------------------------- */
async function boot() {
  $("buildNum").textContent = String(APP_BUILD);
  setNetPill();
  bindDrawer();
  bindModal();
  await registerSW();

  await loadIndex();
  state.view = "modules";
  render();

  // Important: certaines voix ne sont chargées qu’après un tick
  if ("speechSynthesis" in window) {
    speechSynthesis.onvoiceschanged = () => {};
  }
}

boot().catch(err => {
  console.error(err);
  $("app").innerHTML = `
    <div class="card">
      <div class="sectionTitle">Erreur</div>
      <div class="muted">${escapeHtml(String(err))}</div>
      <div style="margin-top:12px;">
        <button class="btn primary" onclick="location.reload()">Recharger</button>
      </div>
    </div>
  `;
});