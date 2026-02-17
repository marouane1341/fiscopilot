/* app.js — FiscoPilot AI ELITE MAX (Premium UI) */
const APP_BUILD = 15; // incrémente quand tu changes JS/UX
const DB_INDEX = "./db_index.json";

const $app = document.getElementById("app");

const state = {
  online: navigator.onLine,
  view: "modules", // modules | module
  modules: [],
  activeModule: null,
  data: null, // merged: lessons/qcm/cases
  tab: "lessons", // lessons | qcm | cases
  query: "",
  modal: { open:false, type:"lessons", index:0 },
};

window.addEventListener("online", () => { state.online=true; render(); });
window.addEventListener("offline", () => { state.online=false; render(); });

function esc(s){ return (s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function levelDot(levelText){
  const t=(levelText||"").toLowerCase();
  if (t.includes("début")) return "beginner";
  if (t.includes("inter")) return "inter";
  if (t.includes("avanc")) return "adv";
  if (t.includes("expert")) return "expert";
  return "inter";
}

async function fetchJson(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function loadModules(){
  const idx = await fetchJson(DB_INDEX);
  state.modules = (idx.modules || []).map(m => ({
    id: m.id,
    title: m.title,
    sources: m.sources || []
  }));
}

function mergeSources(jsons){
  const out = { lessons: [], qcm: [], cases: [], meta: {} };
  for (const j of jsons){
    if (j?.meta) out.meta = { ...out.meta, ...j.meta };
    if (Array.isArray(j?.lessons)) out.lessons.push(...j.lessons);
    if (Array.isArray(j?.qcm)) out.qcm.push(...j.qcm);
    if (Array.isArray(j?.cases)) out.cases.push(...j.cases);
  }
  // normalisation : index + defaults
  out.lessons = out.lessons.map((x,i)=>({
    id: x.id || `l_${i}`,
    title: x.title || `Cours ${i+1}`,
    level: x.level || "🟡 Intermédiaire",
    module: x.module || "TVA Belgique",
    // supporte text OU sections
    text: x.text || "",
    objective: x.objective || "",
    explanation: x.explanation || "",
    example: x.example || "",
    traps: x.traps || "",
    checklist: x.checklist || "",
  }));
  out.qcm = out.qcm.map((x,i)=>({
    level: x.level || "🟡",
    question: x.question || `Question ${i+1}`,
    choices: x.choices || [],
    answer: typeof x.answer === "number" ? x.answer : 0,
    explain: x.explain || "",
  }));
  out.cases = out.cases.map((x,i)=>({
    title: x.title || `Cas ${i+1}`,
    level: x.level || "🟡",
    question: x.question || "",
    answer_md: x.answer_md || "",
  }));
  return out;
}

async function openModule(mod){
  state.activeModule = mod;
  state.view = "module";
  state.tab = "lessons";
  state.query = "";
  render();

  try{
    const jsons = [];
    for (const src of mod.sources){
      jsons.push(await fetchJson("./" + src));
    }
    state.data = mergeSources(jsons);
    render();
  }catch(e){
    state.data = { error: `Erreur chargement module : ${e.message}`, lessons:[], qcm:[], cases:[], meta:{} };
    render();
  }
}

function backToModules(){
  state.view="modules";
  state.activeModule=null;
  state.data=null;
  state.modal.open=false;
  render();
}

function setTab(t){
  state.tab=t;
  state.query="";
  render();
}

function setQuery(v){
  state.query = v;
  render();
}

/* Modal */
function openLesson(index){
  state.modal.open=true;
  state.modal.type="lessons";
  state.modal.index=index;
  render();
}
function closeModal(){
  state.modal.open=false;
  render();
}
function modalPrev(){
  if (!state.data) return;
  const max = state.data.lessons.length;
  state.modal.index = (state.modal.index - 1 + max) % max;
  render();
}
function modalNext(){
  if (!state.data) return;
  const max = state.data.lessons.length;
  state.modal.index = (state.modal.index + 1) % max;
  render();
}

/* Render blocks */
function Topbar(){
  return `
  <div class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <button class="burger" id="burgerBtn" aria-label="Menu">
          <span style="font-size:18px;">☰</span>
        </button>
        <div class="title">FiscoPilot <span style="color:#fbbf24">AI ELITE MAX</span> 🇧🇪</div>
      </div>

      <div class="actions">
        <div class="badge-online">
          <span class="dot"></span>
          <span>${state.online ? "En ligne" : "Hors ligne"}</span>
        </div>
        <button class="btn ghost small" id="forceRefresh">Forcer refresh</button>
        ${state.view==="module" ? `<button class="btn primary small" id="backBtn">Retour</button>` : ``}
      </div>
    </div>
  </div>`;
}

function ModulesView(){
  const cards = state.modules.map(m=>`
    <div class="card" style="margin-top:14px;">
      <div class="card-head">
        <div>
          <div style="font-weight:900;font-size:18px;">📚 ${esc(m.title)}</div>
          <div style="color:rgba(255,255,255,.55);font-weight:800;margin-top:6px;font-size:12px;">
            Sources: ${esc((m.sources||[]).join(", "))}
          </div>
        </div>
        <button class="btn primary" data-open="${esc(m.id)}">Ouvrir</button>
      </div>
      <div class="card-body" style="color:rgba(255,255,255,.65);font-weight:700;">
        UX premium • Lecture plein écran • QCM/Cas en mode pratique
      </div>
    </div>
  `).join("");

  return `
  <div class="container">
    <div class="hero">
      <h1 class="h1">Modules</h1>
      <p class="sub">Mode PWA • Offline-ready • Build ${APP_BUILD}</p>
    </div>
    ${cards || `<div class="card"><div class="card-body">Aucun module dans db_index.json</div></div>`}
  </div>`;
}

function ModuleHeader(){
  const m = state.activeModule;
  const d = state.data;
  const kLessons = d?.lessons?.length || 0;
  const kQcm = d?.qcm?.length || 0;
  const kCases = d?.cases?.length || 0;

  return `
  <div class="container">
    <div class="hero">
      <h1 class="h1">Modules</h1>
      <p class="sub"><span style="font-weight:900;">${esc(m.title)}</span> • Cours: ${kLessons} • QCM: ${kQcm} • Cas: ${kCases}</p>
      <p class="sub" style="font-size:12px;opacity:.85;">Sources: ${(m.sources||[]).map(s=>esc(s)).join(", ")}</p>

      <div class="tabs">
        <button class="tab ${state.tab==="lessons"?"active":""}" data-tab="lessons">📘 Cours</button>
        <button class="tab ${state.tab==="qcm"?"active":""}" data-tab="qcm">🧪 QCM</button>
        <button class="tab ${state.tab==="cases"?"active":""}" data-tab="cases">🧾 Cas</button>
      </div>
    </div>
  </div>
  `;
}

function ModuleToolbar(){
  const placeholder =
    state.tab==="lessons" ? "Rechercher un cours (ex: prorata, intracom, déduction…)" :
    state.tab==="qcm" ? "Rechercher une question (ex: facture, prorata…)" :
    "Rechercher un cas (ex: voiture, intracom…)";

  return `
    <div class="module-toolbar">
      <div class="container">
        <div class="toolbar-inner">
          <input class="search" id="search" value="${esc(state.query)}" placeholder="${esc(placeholder)}" />
          ${state.tab==="lessons" ? `<button class="btn primary" id="randomLesson">Cours aléatoire</button>` : ``}
          ${state.tab==="qcm" ? `<button class="btn primary" id="startQcm5">Lancer 5</button><button class="btn ghost" id="startQcm10">Lancer 10</button>` : ``}
          ${state.tab==="cases" ? `<button class="btn primary" id="randomCase">Cas aléatoire</button>` : ``}
        </div>
      </div>
    </div>
  `;
}

function LessonsList(){
  const d = state.data;
  if (!d) return `<div class="container"><div class="card"><div class="card-body">Chargement…</div></div></div>`;
  if (d.error) return `<div class="container"><div class="card"><div class="card-body">${esc(d.error)}</div></div></div>`;

  const q = state.query.trim().toLowerCase();
  const items = d.lessons
    .map((l,i)=>({l,i}))
    .filter(({l}) => !q || (l.title + " " + (l.text||"") + " " + (l.explanation||"")).toLowerCase().includes(q));

  return `
  <div class="container">
    <div class="list">
      ${items.map(({l,i})=>`
        <div class="item">
          <div class="left">
            <p class="t">${i+1}. ${esc(l.title)}</p>
            <div class="meta">
              <span class="pill"><span class="dot ${levelDot(l.level)}"></span>${esc(l.level)}</span>
              <span class="pill">📌 ${esc(l.module || "TVA Belgique")}</span>
            </div>
          </div>
          <button class="open" data-lesson="${i}">Ouvrir</button>
        </div>
      `).join("")}
    </div>
  </div>`;
}

function QcmView(){
  const d = state.data;
  if (!d) return `<div class="container"><div class="card"><div class="card-body">Chargement…</div></div></div>`;
  if (d.error) return `<div class="container"><div class="card"><div class="card-body">${esc(d.error)}</div></div></div>`;

  const q = state.query.trim().toLowerCase();
  const items = d.qcm
    .map((x,i)=>({x,i}))
    .filter(({x}) => !q || (x.question + " " + (x.explain||"") + " " + (x.choices||[]).join(" ")).toLowerCase().includes(q))
    .slice(0, 30);

  return `
  <div class="container">
    <div class="card">
      <div class="card-body" style="color:rgba(255,255,255,.75);font-weight:750;">
        Ici tu peux lancer une session (5 ou 10). La recherche te montre un aperçu (top 30).
      </div>
    </div>

    <div class="list">
      ${items.map(({x,i})=>`
        <div class="item">
          <div class="left">
            <p class="t">Q${i+1}. ${esc(x.question)}</p>
            <div class="meta">
              <span class="pill">Niveau: ${esc(x.level)}</span>
              <span class="pill">Choix: ${(x.choices||[]).length}</span>
            </div>
          </div>
          <button class="open" data-qcm="${i}">Voir</button>
        </div>
      `).join("")}
    </div>
  </div>`;
}

function CasesView(){
  const d = state.data;
  if (!d) return `<div class="container"><div class="card"><div class="card-body">Chargement…</div></div></div>`;
  if (d.error) return `<div class="container"><div class="card"><div class="card-body">${esc(d.error)}</div></div></div>`;

  const q = state.query.trim().toLowerCase();
  const items = d.cases
    .map((x,i)=>({x,i}))
    .filter(({x}) => !q || (x.title + " " + x.question + " " + (x.answer_md||"")).toLowerCase().includes(q));

  return `
  <div class="container">
    <div class="list">
      ${items.map(({x,i})=>`
        <div class="item">
          <div class="left">
            <p class="t">${esc(x.title)}</p>
            <div class="meta">
              <span class="pill">Niveau: ${esc(x.level)}</span>
              <span class="pill">Cas pratique</span>
            </div>
          </div>
          <button class="open" data-case="${i}">Ouvrir</button>
        </div>
      `).join("")}
    </div>
  </div>`;
}

function LessonModal(){
  if (!state.modal.open || !state.data) return "";
  const l = state.data.lessons[state.modal.index];
  if (!l) return "";

  // Support 2 formats:
  // A) text unique (ton format JSON actuel)
  // B) sections (objective/explanation/example/traps/checklist)
  const blocks = [];

  const hasSections = (l.objective || l.explanation || l.example || l.traps || l.checklist);
  if (hasSections){
    if (l.objective) blocks.push(`<h4>OBJECTIF</h4><p>${esc(l.objective).replace(/\n/g,"<br>")}</p>`);
    if (l.explanation) blocks.push(`<h4>EXPLICATION</h4><p>${esc(l.explanation).replace(/\n/g,"<br>")}</p>`);
    if (l.example) blocks.push(`<h4>EXEMPLE</h4><p>${esc(l.example).replace(/\n/g,"<br>")}</p>`);
    if (l.traps) blocks.push(`<h4>PIÈGES</h4><p>${esc(l.traps).replace(/\n/g,"<br>")}</p>`);
    if (l.checklist) blocks.push(`<h4>CHECKLIST CABINET</h4><p>${esc(l.checklist).replace(/\n/g,"<br>")}</p>`);
  } else {
    blocks.push(`<h4>COURS</h4><p>${esc(l.text || "").replace(/\n/g,"<br>")}</p>`);
  }

  return `
  <div class="modal show" id="modal">
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-top">
        <button class="btn small ghost" id="closeModal">✕</button>
        <div class="sheet-title">
          <h3>${esc(l.title)}</h3>
          <div class="small">${state.modal.index+1}/${state.data.lessons.length} • ${esc(l.level)}</div>
        </div>
        <button class="btn small ghost" id="closeModal2">☰</button>
      </div>

      <div class="sheet-body">
        ${blocks.join("")}
      </div>

      <div class="sheet-nav">
        <button class="btn ghost" id="prevLesson">◀ Précédent</button>
        <button class="btn primary" id="nextLesson">Suivant ▶</button>
      </div>
    </div>
  </div>`;
}

function render(){
  $app.innerHTML = `
    ${Topbar()}
    ${state.view==="modules" ? ModulesView() : `
      ${ModuleHeader()}
      ${ModuleToolbar()}
      ${state.tab==="lessons" ? LessonsList() : state.tab==="qcm" ? QcmView() : CasesView()}
    `}
    ${LessonModal()}
  `;

  // events
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.onclick = backToModules;

  const force = document.getElementById("forceRefresh");
  if (force) force.onclick = async () => {
    // hard refresh: unregister SW + reload
    try{
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }catch(e){}
    location.reload(true);
  };

  // open module
  document.querySelectorAll("[data-open]").forEach(btn=>{
    btn.onclick = () => {
      const id = btn.getAttribute("data-open");
      const m = state.modules.find(x=>x.id===id);
      if (m) openModule(m);
    };
  });

  // tabs
  document.querySelectorAll("[data-tab]").forEach(btn=>{
    btn.onclick = () => setTab(btn.getAttribute("data-tab"));
  });

  // search
  const search = document.getElementById("search");
  if (search){
    search.oninput = (e)=> setQuery(e.target.value);
  }

  // lesson open
  document.querySelectorAll("[data-lesson]").forEach(btn=>{
    btn.onclick = () => openLesson(parseInt(btn.getAttribute("data-lesson"),10));
  });

  // modal
  const m = document.getElementById("modal");
  if (m){
    m.addEventListener("click", (e)=>{ if (e.target.id==="modal") closeModal(); });
    document.getElementById("closeModal").onclick = closeModal;
    document.getElementById("closeModal2").onclick = closeModal;
    document.getElementById("prevLesson").onclick = modalPrev;
    document.getElementById("nextLesson").onclick = modalNext;
  }

  // random lesson
  const rL = document.getElementById("randomLesson");
  if (rL && state.data?.lessons?.length){
    rL.onclick = () => openLesson(Math.floor(Math.random()*state.data.lessons.length));
  }

  // random case
  const rC = document.getElementById("randomCase");
  if (rC && state.data?.cases?.length){
    rC.onclick = () => {
      const c = state.data.cases[Math.floor(Math.random()*state.data.cases.length)];
      alert(`${c.title}\n\n${c.question}\n\n---\nRéponse:\n${c.answer_md}`);
    };
  }

  // qcm preview click
  document.querySelectorAll("[data-qcm]").forEach(btn=>{
    btn.onclick = () => {
      const i = parseInt(btn.getAttribute("data-qcm"),10);
      const q = state.data.qcm[i];
      alert(`${q.question}\n\n${q.choices.map((c,ix)=>`${ix+1}) ${c}`).join("\n")}\n\n---\nRéponse: ${q.answer+1}\n${q.explain||""}`);
    };
  });

  // qcm sessions (simple)
  const s5 = document.getElementById("startQcm5");
  const s10 = document.getElementById("startQcm10");
  if (s5) s5.onclick = ()=> runQcm(5);
  if (s10) s10.onclick = ()=> runQcm(10);
}

function runQcm(n){
  const d = state.data;
  if (!d?.qcm?.length) return;

  const pool = [...d.qcm];
  // shuffle
  for (let i=pool.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const quiz = pool.slice(0, Math.min(n, pool.length));

  let score = 0;
  for (let k=0;k<quiz.length;k++){
    const q = quiz[k];
    const answer = prompt(
      `Q${k+1}/${quiz.length}: ${q.question}\n\n` +
      q.choices.map((c,ix)=>`${ix+1}) ${c}`).join("\n") +
      `\n\nRéponds par un numéro (1-${q.choices.length})`
    );
    const user = parseInt(answer||"",10)-1;
    const ok = user === q.answer;
    if (ok) score++;
    alert((ok?"✅ Correct":"❌ Incorrect") + `\n\nExplication:\n${q.explain||"(pas d'explication)"}\n\nScore actuel: ${score}/${k+1}`);
  }
  alert(`Résultat final: ${score}/${quiz.length}`);
}

/* Boot */
(async function init(){
  try{
    await loadModules();
  }catch(e){
    state.modules = [];
  }
  render();
})();