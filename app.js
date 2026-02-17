/* app.js — Build 33 */
const APP_BUILD = 33;

const $ = (s) => document.querySelector(s);

const state = {
  modules: [],
  activeModule: null,
  merged: { lessons: [], qcm: [], cases: [] },
  view: "courses", // courses | qcm | cases
  filter: "",
  modalOpen: false,
  modalList: [],
  modalIndex: 0,
};

function setOnlineUI() {
  const pill = $("#netPill");
  const online = navigator.onLine;
  pill.textContent = online ? "En ligne" : "Hors ligne";
  pill.classList.toggle("online", online);
}

window.addEventListener("online", setOnlineUI);
window.addEventListener("offline", setOnlineUI);

function levelBadgeClass(levelStr = "") {
  const s = levelStr.toLowerCase();
  if (s.includes("début")) return "green";
  if (s.includes("inter")) return "yellow";
  if (s.includes("avan")) return "yellow";
  if (s.includes("expert")) return "red";
  if (s.includes("🔴")) return "red";
  if (s.includes("🟠")) return "yellow";
  if (s.includes("🟡")) return "yellow";
  if (s.includes("🟢")) return "green";
  return "";
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.json();
}

function normalizeLesson(x, idx) {
  return {
    id: x.id || `lesson_${idx}`,
    title: x.title || `Cours ${idx + 1}`,
    level: x.level || "Intermédiaire",
    text: x.text || x.content || "",
    module: x.module || "TVA Belgique",
  };
}

function normalizeQcm(x, idx) {
  return {
    id: x.id || `qcm_${idx}`,
    level: x.level || "",
    question: x.question || "",
    choices: x.choices || [],
    answer: typeof x.answer === "number" ? x.answer : 0,
    explain: x.explain || "",
    module: x.module || "TVA Belgique",
  };
}

function normalizeCase(x, idx) {
  return {
    id: x.id || `case_${idx}`,
    title: x.title || `Cas ${idx + 1}`,
    level: x.level || "",
    question: x.question || "",
    answer_md: x.answer_md || x.answer || "",
    module: x.module || "TVA Belgique",
  };
}

function mergeSources(jsonList) {
  const lessons = [];
  const qcm = [];
  const cases = [];

  jsonList.forEach((j, srcIndex) => {
    (j.lessons || []).forEach((x, i) => lessons.push(normalizeLesson(x, lessons.length)));
    (j.qcm || []).forEach((x, i) => qcm.push(normalizeQcm(x, qcm.length)));
    (j.cases || []).forEach((x, i) => cases.push(normalizeCase(x, cases.length)));
  });

  // tri “logique” : si les titres commencent par "1." "2." etc, on respecte l'ordre
  const extractN = (t) => {
    const m = String(t).trim().match(/^(\d+)\s*[\.\-:]/);
    return m ? parseInt(m[1], 10) : 9999;
  };
  lessons.sort((a,b)=> extractN(a.title) - extractN(b.title));

  return { lessons, qcm, cases };
}

function render() {
  const app = $("#app");
  app.innerHTML = "";

  const header = document.createElement("div");
  header.className = "card";
  header.innerHTML = `
    <div class="cardPad">
      <div class="h1">Modules</div>
      <p class="sub">Choisis un module. Les cours premium ont un objectif, une explication claire, des exemples et “à retenir”.</p>
      <div class="moduleRow">
        <div>
          <div class="moduleTitle">📚 TVA Belgique</div>
          <div class="moduleMeta" id="metaLine">Sources: ${state.activeModule ? state.activeModule.sources.join(", ") : "db/tva*.json"}</div>
        </div>
        <button class="btn primary" id="openModule">Ouvrir</button>
      </div>
    </div>
  `;
  app.appendChild(header);

  if (!state.activeModule) return;

  const stats = document.createElement("div");
  stats.className = "card";
  stats.innerHTML = `
    <div class="cardPad">
      <div class="moduleRow">
        <div>
          <div class="moduleTitle">📘 TVA Belgique</div>
          <div class="moduleMeta">Cours: ${state.merged.lessons.length} • QCM: ${state.merged.qcm.length} • Cas: ${state.merged.cases.length}</div>
          <div class="moduleMeta">Sources: ${state.activeModule.sources.join(", ")}</div>
        </div>
        <button class="btn ghost" id="backModules">← Retour</button>
      </div>

      <div class="tabs">
        <button class="tab ${state.view==="courses"?"active":""}" data-view="courses">📘 Cours</button>
        <button class="tab ${state.view==="qcm"?"active":""}" data-view="qcm">🧪 QCM</button>
        <button class="tab ${state.view==="cases"?"active":""}" data-view="cases">🧾 Cas</button>
      </div>

      <div style="height:14px"></div>

      <div class="searchRow">
        <input class="search" id="search" placeholder="Rechercher (ex: prorata, facture, intracom)" value="${escapeHtml(state.filter)}"/>
        <button class="btn primary" id="randomBtn">${state.view==="courses"?"Cours aléatoire":state.view==="qcm"?"QCM aléatoire":"Cas aléatoire"}</button>
      </div>

      <div class="list" id="list"></div>
    </div>
  `;
  app.appendChild(stats);

  // events
  $("#backModules").onclick = () => { state.activeModule = null; render(); };

  document.querySelectorAll(".tab").forEach(btn=>{
    btn.onclick = () => { state.view = btn.dataset.view; state.filter=""; render(); };
  });

  $("#search").oninput = (e) => { state.filter = e.target.value || ""; renderList(); };
  $("#randomBtn").onclick = () => openRandom();

  renderList();
}

function renderList() {
  const list = $("#list");
  if (!list) return;

  let items = [];
  if (state.view === "courses") items = state.merged.lessons;
  if (state.view === "qcm") items = state.merged.qcm;
  if (state.view === "cases") items = state.merged.cases;

  const q = state.filter.trim().toLowerCase();
  if (q) {
    items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
  }

  list.innerHTML = "";

  if (state.view === "courses") {
    items.forEach((x, idx) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div style="flex:1; min-width:0">
          <div class="itemTitle">${escapeHtml(x.title)}</div>
          <div class="badges">
            <span class="badge ${levelBadgeClass(x.level)}">${escapeHtml(x.level)}</span>
            <span class="badge">📌 ${escapeHtml(x.module)}</span>
          </div>
        </div>
        <button class="openBtn">Ouvrir</button>
      `;
      div.querySelector(".openBtn").onclick = () => openModal(items, idx, "course");
      list.appendChild(div);
    });
  }

  if (state.view === "qcm") {
    items.forEach((x, idx) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div style="flex:1; min-width:0">
          <div class="itemTitle">${escapeHtml(x.question || "QCM")}</div>
          <div class="badges">
            <span class="badge ${levelBadgeClass(x.level)}">${escapeHtml(x.level || "QCM")}</span>
            <span class="badge">📌 ${escapeHtml(x.module)}</span>
          </div>
        </div>
        <button class="openBtn">Ouvrir</button>
      `;
      div.querySelector(".openBtn").onclick = () => openModal(items, idx, "qcm");
      list.appendChild(div);
    });
  }

  if (state.view === "cases") {
    items.forEach((x, idx) => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div style="flex:1; min-width:0">
          <div class="itemTitle">${escapeHtml(x.title || "Cas")}</div>
          <div class="badges">
            <span class="badge ${levelBadgeClass(x.level)}">${escapeHtml(x.level || "Cas")}</span>
            <span class="badge">📌 ${escapeHtml(x.module)}</span>
          </div>
        </div>
        <button class="openBtn">Ouvrir</button>
      `;
      div.querySelector(".openBtn").onclick = () => openModal(items, idx, "case");
      list.appendChild(div);
    });
  }
}

function openRandom() {
  let items = [];
  if (state.view === "courses") items = state.merged.lessons;
  if (state.view === "qcm") items = state.merged.qcm;
  if (state.view === "cases") items = state.merged.cases;

  const q = state.filter.trim().toLowerCase();
  if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
  if (!items.length) return;

  const idx = Math.floor(Math.random() * items.length);
  openModal(items, idx, state.view === "courses" ? "course" : state.view === "qcm" ? "qcm" : "case");
}

function openModal(list, index, kind) {
  state.modalList = list;
  state.modalIndex = index;
  state.modalOpen = true;

  $("#modal").classList.add("open");
  $("#modal").setAttribute("aria-hidden", "false");

  $("#prevBtn").onclick = () => { if (state.modalIndex > 0) { state.modalIndex--; paintModal(kind); } };
  $("#nextBtn").onclick = () => { if (state.modalIndex < state.modalList.length - 1) { state.modalIndex++; paintModal(kind); } };
  $("#modalClose").onclick = closeModal;

  paintModal(kind);
}

function closeModal() {
  state.modalOpen = false;
  $("#modal").classList.remove("open");
  $("#modal").setAttribute("aria-hidden", "true");
}

function paintModal(kind) {
  const item = state.modalList[state.modalIndex];
  $("#modalPos").textContent = `${state.modalIndex + 1}/${state.modalList.length}`;
  $("#modalLevel").textContent = item.level || (kind === "qcm" ? "QCM" : kind === "case" ? "Cas" : "Cours");

  const body = $("#modalBody");
  body.innerHTML = "";

  if (kind === "course") {
    body.innerHTML = `
      <div class="card" style="box-shadow:none; background:rgba(255,255,255,.03); border-color:rgba(255,255,255,.10)">
        <div class="cardPad">
          <div class="badge ${levelBadgeClass(item.level)}" style="display:inline-block; margin-bottom:10px">${escapeHtml(item.level)}</div>
          <h2 style="margin:0 0 12px; font-size:26px; letter-spacing:-.3px">${escapeHtml(item.title)}</h2>
          <div style="color:rgba(234,241,255,.82); line-height:1.55; font-size:16px; white-space:pre-wrap">${escapeHtml(item.text)}</div>
        </div>
      </div>
    `;
  }

  if (kind === "qcm") {
    const choices = (item.choices || []).map((c, i) => {
      return `<div style="padding:10px 12px; border:1px solid rgba(255,255,255,.10); border-radius:14px; background:rgba(255,255,255,.04); margin-top:8px">
        <b>${i + 1}.</b> ${escapeHtml(c)}
      </div>`;
    }).join("");

    body.innerHTML = `
      <div class="card" style="box-shadow:none; background:rgba(255,255,255,.03); border-color:rgba(255,255,255,.10)">
        <div class="cardPad">
          <h2 style="margin:0 0 10px; font-size:22px">${escapeHtml(item.question)}</h2>
          ${choices}
          <div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,.10); color:rgba(234,241,255,.75)">
            <b>Réponse :</b> ${typeof item.answer === "number" ? (item.answer + 1) : "-"}
            <br/>
            <b>Explication :</b> ${escapeHtml(item.explain || "")}
          </div>
        </div>
      </div>
    `;
  }

  if (kind === "case") {
    body.innerHTML = `
      <div class="card" style="box-shadow:none; background:rgba(255,255,255,.03); border-color:rgba(255,255,255,.10)">
        <div class="cardPad">
          <h2 style="margin:0 0 8px; font-size:24px">${escapeHtml(item.title)}</h2>
          <div style="color:rgba(234,241,255,.86); line-height:1.55; font-size:16px; white-space:pre-wrap"><b>Question :</b>\n${escapeHtml(item.question)}</div>
          <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,.10); color:rgba(234,241,255,.78); white-space:pre-wrap"><b>Réponse attendue :</b>\n${escapeHtml(item.answer_md)}</div>
        </div>
      </div>
    `;
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Drawer + actions */
function initChrome() {
  $("#buildNum").textContent = String(APP_BUILD);

  const drawer = $("#drawer");
  const open = () => { drawer.classList.add("open"); drawer.setAttribute("aria-hidden","false"); };
  const close = () => { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden","true"); };

  $("#btnMenu").onclick = open;
  $("#btnClose").onclick = close;

  $("#navModules").onclick = () => { close(); state.activeModule = null; render(); };

  $("#navForceRefresh").onclick = async () => {
    close();
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      location.reload(true);
    } catch (e) {
      alert("Refresh forcé: ouvre en navigation privée si besoin.");
    }
  };

  $("#modalMenu").onclick = open;
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
  });
}

async function boot() {
  setOnlineUI();
  initChrome();

  // Load modules index
  const idx = await fetchJson(`db_index.json?v=${APP_BUILD}`);
  state.modules = idx.modules || [];

  // Active TVA by default
  state.activeModule = state.modules.find(m => m.id === "tva_be") || state.modules[0] || null;

  if (state.activeModule) {
    const sources = state.activeModule.sources || [];
    const jsons = [];
    for (const s of sources) {
      jsons.push(await fetchJson(`${s}?v=${APP_BUILD}`));
    }
    state.merged = mergeSources(jsons);
  }

  render();

  // Button "Ouvrir" (modules card)
  const openBtn = $("#openModule");
  if (openBtn) {
    openBtn.onclick = () => {
      // si déjà actif, rerender suffit
      if (!state.activeModule) {
        state.activeModule = state.modules.find(m => m.id === "tva_be") || state.modules[0];
      }
      render();
    };
  }

  // Register SW
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register(`sw.js?v=${APP_BUILD}`);
    } catch (e) {
      // ok
    }
  }
}

boot().catch(err => {
  console.error(err);
  const app = $("#app");
  if (app) app.innerHTML = `<div class="card"><div class="cardPad">Erreur chargement: ${escapeHtml(err.message)}</div></div>`;
});