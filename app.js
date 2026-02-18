/* =========================
   FiscoPilot Premium v34
   ========================= */

const APP_BUILD = 34;

const el = (sel) => document.querySelector(sel);
const app = el("#app");

const state = {
  modules: [],
  activeModule: null,
  lessons: [],
  qcm: [],
  cases: [],
  view: "modules", // modules | module
  tab: "lessons",  // lessons | qcm | cases
  search: "",
  modalOpen: false,
  currentIndex: 0,
};

function escapeHtml(s=""){
  return s.replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function levelDot(levelText=""){
  const t = levelText.toLowerCase();
  if (t.includes("début") || t.includes("debut")) return "green";
  if (t.includes("inter")) return "yellow";
  if (t.includes("avanc")) return "yellow";
  if (t.includes("expert")) return "red";
  if (t.includes("🟢")) return "green";
  if (t.includes("🟡") || t.includes("🟠")) return "yellow";
  if (t.includes("🔴")) return "red";
  return "yellow";
}

function setOnlinePill(){
  const pill = el("#netPill");
  const online = navigator.onLine;
  pill.textContent = online ? "En ligne" : "Hors ligne";
  pill.classList.toggle("online", online);
  pill.classList.toggle("offline", !online);
}
window.addEventListener("online", setOnlinePill);
window.addEventListener("offline", setOnlinePill);

function drawer(open){
  const d = el("#drawer");
  d.classList.toggle("open", !!open);
  d.setAttribute("aria-hidden", open ? "false" : "true");
}
el("#btnMenu").addEventListener("click", ()=>drawer(true));
el("#btnClose").addEventListener("click", ()=>drawer(false));
el("#navModules").addEventListener("click", ()=>{
  drawer(false);
  goModules();
});

el("#forceRefresh").addEventListener("click", async ()=>{
  drawer(false);
  await hardRefresh();
});

async function hardRefresh(){
  try{
    if ("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  }catch(e){}
  const u = new URL(location.href);
  u.searchParams.set("v", String(Date.now()));
  location.href = u.toString();
}

/* ---------- Data loading ---------- */

async function fetchJson(url){
  // Force fresh where possible
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

async function loadIndex(){
  // db_index.json at root
  const idx = await fetchJson(`db_index.json?v=${APP_BUILD}`);
  state.modules = idx.modules || [];
}

async function loadModule(mod){
  // mod.sources = ["db/tva.json", ...]
  const sources = mod.sources || [];
  const blobs = await Promise.all(sources.map(s => fetchJson(`${s}?v=${APP_BUILD}`)));

  // Merge
  const lessons = [];
  const qcm = [];
  const cases = [];

  for (const b of blobs){
    if (Array.isArray(b.lessons)) lessons.push(...b.lessons);
    if (Array.isArray(b.qcm)) qcm.push(...b.qcm);
    if (Array.isArray(b.cases)) cases.push(...b.cases);
  }

  state.activeModule = mod;
  state.lessons = lessons;
  state.qcm = qcm;
  state.cases = cases;
  state.tab = "lessons";
  state.search = "";
  state.view = "module";
  render();
}

/* ---------- Views ---------- */

function goModules(){
  state.view = "modules";
  state.activeModule = null;
  state.lessons = [];
  state.qcm = [];
  state.cases = [];
  closeModal();
  render();
}

function renderModules(){
  const html = `
    <div class="card">
      <div class="cardPad">
        <div class="cardTitle">Modules</div>
        <div class="cardSub">Choisis un module. Les cours premium ont un objectif, une explication claire, des exemples et “à retenir”.</div>
        <hr class="sep" />

        ${state.modules.map(m => `
          <div class="moduleItem">
            <div>
              <div class="moduleName">📚 ${escapeHtml(m.title || m.id)}</div>
              <div class="moduleSources">Sources: ${(m.sources || []).map(s=>escapeHtml(s)).join(", ")}</div>
            </div>
            <button class="btn primary" data-open="${escapeHtml(m.id)}">Ouvrir</button>
          </div>
        `).join("")}

      </div>
    </div>
  `;

  app.innerHTML = html;

  app.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-open");
      const mod = state.modules.find(x => x.id === id);
      if (mod) loadModule(mod).catch(err=>{
        app.innerHTML = `<div class="card"><div class="cardPad">
          <div class="cardTitle">Erreur</div>
          <div class="cardSub">Impossible de charger le module. Vérifie les JSON / chemins.</div>
          <div class="block"><h3>Détail</h3><p class="mono">${escapeHtml(String(err))}</p></div>
          <button class="btn ghost" id="backBtn">← Retour</button>
        </div></div>`;
        el("#backBtn").addEventListener("click", goModules);
      });
    });
  });
}

function currentList(){
  if (state.tab === "lessons") return state.lessons;
  if (state.tab === "qcm") return state.qcm;
  return state.cases;
}

function filteredList(){
  const q = state.search.trim().toLowerCase();
  const list = currentList();
  if (!q) return list;

  return list.filter(it=>{
    const s = JSON.stringify(it).toLowerCase();
    return s.includes(q);
  });
}

function renderModule(){
  const mod = state.activeModule;
  const lessonsCount = state.lessons.length;
  const qcmCount = state.qcm.length;
  const casesCount = state.cases.length;
  const sources = (mod.sources||[]).join(", ");

  const list = filteredList();

  const header = `
    <div class="card">
      <div class="cardPad">
        <div class="cardTitle">${escapeHtml(mod.title || "Module")}</div>
        <div class="cardSub">Cours: ${lessonsCount} • QCM: ${qcmCount} • Cas: ${casesCount}</div>
        <div class="small">Sources: ${escapeHtml(sources)}</div>

        <div class="btnRow" style="margin-top:14px">
          <button class="btn ghost" id="back">← Retour</button>
        </div>

        <div class="tabs">
          <button class="tab ${state.tab==="lessons"?"active":""}" data-tab="lessons">📘 Cours</button>
          <button class="tab ${state.tab==="qcm"?"active":""}" data-tab="qcm">🧪 QCM</button>
          <button class="tab ${state.tab==="cases"?"active":""}" data-tab="cases">🧾 Cas</button>
        </div>

        <div class="searchRow">
          <input class="search" id="search" placeholder="Rechercher (ex: prorata, facture, intracom)" value="${escapeHtml(state.search)}" />
          <button class="btn primary" id="randomBtn">Aléatoire</button>
        </div>
      </div>
    </div>
  `;

  const items = `
    <div class="list">
      ${list.map((it, idx) => renderItem(it, idx)).join("")}
    </div>
  `;

  app.innerHTML = header + items;

  el("#back").addEventListener("click", goModules);
  app.querySelectorAll("[data-tab]").forEach(t=>{
    t.addEventListener("click", ()=>{
      state.tab = t.getAttribute("data-tab");
      state.search = "";
      closeModal();
      render();
    });
  });

  el("#search").addEventListener("input", (e)=>{
    state.search = e.target.value;
    render(); // simple & ok vu la taille
  });

  el("#randomBtn").addEventListener("click", ()=>{
    const list = filteredList();
    if (!list.length) return;
    const idx = Math.floor(Math.random() * list.length);
    openModalFromFilteredIndex(idx);
  });

  app.querySelectorAll("[data-open-item]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const idx = Number(b.getAttribute("data-open-item"));
      openModalFromFilteredIndex(idx);
    });
  });
}

function renderItem(it, filteredIdx){
  // Normalize fields
  const title = it.title || it.question || "Item";
  const level = it.level || "Niveau";
  const dot = levelDot(level);
  const typeBadge = state.tab === "lessons" ? "📌 TVA Belgique" : state.tab === "qcm" ? "🧪 QCM" : "🧾 Cas";

  const subtitle =
    state.tab === "qcm"
      ? (it.explain ? "Explication incluse" : "QCM")
      : state.tab === "cases"
      ? "Cas pratique"
      : "Cours premium";

  return `
    <div class="item">
      <div style="min-width:0">
        <div class="itemTitle">${escapeHtml(title)}</div>
        <div class="badges">
          <span class="badge"><span class="dot ${dot}"></span> ${escapeHtml(level)}</span>
          <span class="badge">${escapeHtml(typeBadge)}</span>
          <span class="badge">${escapeHtml(subtitle)}</span>
        </div>
      </div>
      <button class="openBtn" data-open-item="${filteredIdx}">Ouvrir</button>
    </div>
  `;
}

/* ---------- Modal ---------- */

function openModalFromFilteredIndex(filteredIdx){
  const list = filteredList();
  const item = list[filteredIdx];
  if (!item) return;

  state.modalOpen = true;
  state.currentIndex = filteredIdx;

  // Header
  el("#modalLevel").textContent = item.level || "Niveau";
  el("#modalPos").textContent = `${filteredIdx + 1}/${list.length}`;

  // Content
  el("#modalBody").innerHTML = renderModalContent(item);

  // Open
  const m = el("#modal");
  m.classList.add("open");
  m.setAttribute("aria-hidden", "false");

  // Buttons
  el("#prevBtn").onclick = ()=> navModal(-1);
  el("#nextBtn").onclick = ()=> navModal(+1);
  el("#modalClose").onclick = closeModal;

  // “Sommaire” (simple : remonte en haut)
  el("#modalMenu").onclick = ()=>{
    el("#modalBody").scrollTo({ top: 0, behavior: "smooth" });
  };
}

function navModal(delta){
  const list = filteredList();
  if (!list.length) return;
  let next = state.currentIndex + delta;
  if (next < 0) next = 0;
  if (next >= list.length) next = list.length - 1;
  openModalFromFilteredIndex(next);
}

function closeModal(){
  state.modalOpen = false;
  const m = el("#modal");
  m.classList.remove("open");
  m.setAttribute("aria-hidden", "true");
}

el("#modal").addEventListener("click", (e)=>{
  // click outside sheet closes
  if (e.target.id === "modal") closeModal();
});

function renderModalContent(it){
  // LESSON
  if (state.tab === "lessons"){
    const title = escapeHtml(it.title || "Cours");
    const txt = (it.text || "").trim();

    // If the text already contains structured sections, keep it as paragraphs
    const paragraphs = txt
      ? txt.split(/\n{2,}/).map(p => `<p>${escapeHtml(p).replace(/\n/g,"<br>")}</p>`).join("")
      : `<p class="small">Aucun contenu.</p>`;

    return `
      <div class="h1">${title}</div>

      <div class="block">
        <h3>Objectif</h3>
        <p>Comprendre et appliquer le point de TVA de façon “cabinet” : qualification, règle, preuve, conclusion.</p>
      </div>

      <div class="block">
        <h3>Explication</h3>
        ${paragraphs}
      </div>

      <div class="block">
        <h3>À retenir</h3>
        <ul>
          <li>Une conclusion TVA sans <b>preuve</b> est fragile.</li>
          <li>On qualifie d’abord (qui/quoi/où/quand), on calcule ensuite.</li>
          <li>Une méthode stable + dossier propre = sécurité en contrôle.</li>
        </ul>
      </div>

      <div class="block">
        <h3>Mini-exercice</h3>
        <p>Réécris la règle en 3 lignes comme si tu l’expliquais à un client, puis note la preuve à conserver.</p>
      </div>
    `;
  }

  // QCM
  if (state.tab === "qcm"){
    const q = escapeHtml(it.question || "Question");
    const choices = Array.isArray(it.choices) ? it.choices : [];
    const ans = Number.isFinite(it.answer) ? it.answer : null;
    const explain = it.explain ? escapeHtml(it.explain) : "";

    return `
      <div class="h1">QCM</div>

      <div class="block">
        <h3>Question</h3>
        <p>${q}</p>
      </div>

      <div class="block">
        <h3>Choix</h3>
        <ul>
          ${choices.map((c,i)=>`<li>${escapeHtml(c)}${ans===i ? " <b>(réponse)</b>" : ""}</li>`).join("")}
        </ul>
      </div>

      ${explain ? `
        <div class="block">
          <h3>Explication</h3>
          <p>${explain}</p>
        </div>
      ` : ""}
    `;
  }

  // CASE
  const title = escapeHtml(it.title || "Cas pratique");
  const question = escapeHtml(it.question || "");
  const answer = (it.answer_md || it.answer || "").toString();

  return `
    <div class="h1">${title}</div>

    <div class="block">
      <h3>Énoncé</h3>
      <p>${question || "—"}</p>
    </div>

    <div class="block">
      <h3>Correction</h3>
      <p class="mono">${escapeHtml(answer)}</p>
    </div>

    <div class="block">
      <h3>Réflexe cabinet</h3>
      <ul>
        <li>Qualification → règle → application → conclusion.</li>
        <li>Ajoute toujours la <b>preuve</b> qui sécurise le raisonnement.</li>
      </ul>
    </div>
  `;
}

/* ---------- Main render ---------- */

function render(){
  if (state.view === "modules") renderModules();
  else renderModule();
}

/* ---------- Init ---------- */

async function init(){
  el("#buildNum").textContent = String(APP_BUILD);
  setOnlinePill();

  // Register SW
  if ("serviceWorker" in navigator){
    try{
      await navigator.serviceWorker.register(`sw.js?v=${APP_BUILD}`);
    }catch(e){}
  }

  await loadIndex();
  render();
}

init().catch(err=>{
  app.innerHTML = `<div class="card"><div class="cardPad">
    <div class="cardTitle">Erreur</div>
    <div class="cardSub">Impossible de démarrer l’app.</div>
    <div class="block"><h3>Détail</h3><p class="mono">${escapeHtml(String(err))}</p></div>
    <button class="btn primary" id="rf">Forcer refresh</button>
  </div></div>`;
  el("#rf").addEventListener("click", hardRefresh);
});