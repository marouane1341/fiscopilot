/* =========================
   FiscoPilot AI ELITE MAX — app.js (premium)
   - Modules + Lessons + QCM + Cases
   - Modal course viewer
   - Audio lecture (speechSynthesis)
   - Progress tracking (localStorage)
   ========================= */

const APP_BUILD = 36; // <-- incrémente à chaque changement important

// ---------- DOM
const $ = (sel) => document.querySelector(sel);
const app = $("#app");

const btnMenu = $("#btnMenu");
const btnClose = $("#btnClose");
const drawer = $("#drawer");
const navModules = $("#navModules");
const navForceRefresh = $("#navForceRefresh");

const modal = $("#modal");
const modalClose = $("#modalClose");
const modalBody = $("#modalBody");
const modalLevel = $("#modalLevel");
const modalPos = $("#modalPos");
const modalMenu = $("#modalMenu");
const prevBtn = $("#prevBtn");
const nextBtn = $("#nextBtn");

const netPill = $("#netPill");
const buildNum = $("#buildNum");

// ---------- State
let dbIndex = null;
let activeModule = null; // {id,title,sources[]}
let activeData = { lessons: [], qcm: [], cases: [] }; // merged
let tab = "lessons"; // lessons|qcm|cases
let filtered = [];   // current list (tab)
let currentIndex = 0;

// Progress storage
const LS_KEY = "fiscopilot_progress_v1";
function loadProgress(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function saveProgress(p){ localStorage.setItem(LS_KEY, JSON.stringify(p)); }

// Audio (Web Speech)
let speaking = false;
let paused = false;
let utter = null;
let speechRate = 1.0;

// ---------- Utils
function esc(s){ return (s ?? "").toString().replace(/[&<>"']/g, m => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[m]));}

function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

function shortPreview(text, max=220){
  const t = (text || "").replace(/\s+/g," ").trim();
  if (!t) return "";
  return t.length <= max ? t : (t.slice(0,max-1) + "…");
}

function norm(s){
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function setOnlinePill(){
  const on = navigator.onLine;
  netPill.textContent = on ? "En ligne" : "Hors ligne";
  netPill.className = "pill " + (on ? "online" : "offline");
}

window.addEventListener("online", setOnlinePill);
window.addEventListener("offline", setOnlinePill);

// ---------- Service worker
async function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  try{
    await navigator.serviceWorker.register("sw.js");
  }catch(e){
    console.warn("SW register failed", e);
  }
}

// ---------- Fetch JSON with cache-bust
async function fetchJson(url){
  const bust = `cb=${Date.now()}`;
  const u = url.includes("?") ? `${url}&${bust}` : `${url}?${bust}`;
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ---------- Merge sources
function mergeData(list){
  const merged = { lessons: [], qcm: [], cases: [] };
  for (const d of list){
    if (Array.isArray(d.lessons)) merged.lessons.push(...d.lessons);
    if (Array.isArray(d.qcm)) merged.qcm.push(...d.qcm);
    if (Array.isArray(d.cases)) merged.cases.push(...d.cases);
  }
  return merged;
}

// ---------- Drawer
function openDrawer(){
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden","false");
}
function closeDrawer(){
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden","true");
}

// ---------- Render: Modules screen
function renderModules(){
  activeModule = null;
  tab = "lessons";
  stopSpeech();

  const mods = dbIndex?.modules || [];
  app.innerHTML = `
    <div class="h1">Modules</div>
    <div class="sub">Choisis un module. Les cours premium ont un objectif, une explication claire, des exemples et “à retenir”.</div>

    <div class="card block" style="margin-top:16px;">
      ${mods.map(m => `
        <div class="lessonCard">
          <div class="lessonTop">
            <div>
              <div class="lessonTitle">📚 ${esc(m.title || m.id)}</div>
              <div class="preview">Sources: ${esc((m.sources||[]).join(", "))}</div>
            </div>
            <button class="openBtn" data-open-module="${esc(m.id)}">Ouvrir</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  app.querySelectorAll("[data-open-module]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-open-module");
      const m = mods.find(x=>x.id===id);
      if (!m) return;
      await openModule(m);
    });
  });
}

// ---------- Load module
async function openModule(m){
  activeModule = m;
  stopSpeech();

  // Load all sources and merge
  const datas = [];
  for (const src of (m.sources||[])){
    try{
      const d = await fetchJson(src);
      datas.push(d);
    }catch(e){
      console.warn("Failed src", src, e);
    }
  }
  activeData = mergeData(datas);

  renderModuleHome();
}

// ---------- Render: Module Home (tabs + list)
function renderModuleHome(){
  stopSpeech();

  const p = loadProgress();
  const modKey = activeModule.id;
  const prog = p[modKey] || { seen: {}, last: null };

  const lessonsCount = activeData.lessons.length;
  const qcmCount = activeData.qcm.length;
  const casesCount = activeData.cases.length;

  const seenCount = Object.keys(prog.seen || {}).length;

  app.innerHTML = `
    <div class="h1">Modules</div>

    <div class="card block" style="margin-top:14px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div>
          <div class="lessonTitle">📘 ${esc(activeModule.title || activeModule.id)}</div>
          <div class="sub" style="margin-top:6px;">
            Cours: ${lessonsCount} • QCM: ${qcmCount} • Cas: ${casesCount}<br/>
            <span style="color:rgba(255,255,255,.55)">Progression :</span> ${seenCount}/${lessonsCount} cours lus
          </div>
          <div class="preview" style="margin-top:10px;">
            Sources: ${esc((activeModule.sources||[]).join(", "))}
          </div>
        </div>
        <button class="btn ghost" id="backToModules">← Retour</button>
      </div>

      <div class="tabs">
        <button class="tab ${tab==="lessons"?"active":""}" data-tab="lessons">📘 Cours</button>
        <button class="tab ${tab==="qcm"?"active":""}" data-tab="qcm">🧪 QCM</button>
        <button class="tab ${tab==="cases"?"active":""}" data-tab="cases">🧾 Cas</button>
      </div>

      <div class="searchRow">
        <input class="search" id="searchInput" placeholder="Rechercher (ex: prorata, facture, intracom)" />
        <button class="btn primary" id="randomBtn">${tab==="lessons"?"Cours":"Aléatoire"}</button>
      </div>
    </div>

    <div id="list"></div>
  `;

  $("#backToModules").addEventListener("click", renderModules);

  app.querySelectorAll("[data-tab]").forEach(b=>{
    b.addEventListener("click", ()=>{
      tab = b.getAttribute("data-tab");
      renderModuleHome();
    });
  });

  const searchInput = $("#searchInput");
  searchInput.addEventListener("input", ()=> renderList(searchInput.value));

  $("#randomBtn").addEventListener("click", ()=>{
    if (filtered.length === 0) return;
    const i = Math.floor(Math.random() * filtered.length);
    openItem(i);
  });

  renderList("");
}

function getCurrentArray(){
  if (tab==="lessons") return activeData.lessons;
  if (tab==="qcm") return activeData.qcm;
  return activeData.cases;
}

// ---------- Render list
function renderList(query){
  const arr = getCurrentArray();
  const q = norm(query);

  filtered = arr.filter(item=>{
    if (!q) return true;
    const hay = norm(JSON.stringify(item));
    return hay.includes(q);
  });

  const list = $("#list");
  if (!list) return;

  if (tab==="lessons"){
    const p = loadProgress();
    const modKey = activeModule.id;
    const prog = p[modKey] || { seen: {}, last: null };

    list.innerHTML = filtered.map((l,idx)=>{
      const id = l.id || `lesson_${idx}`;
      const seen = !!prog.seen?.[id];
      const level = l.level || "—";
      const title = l.title || "Sans titre";
      const preview = shortPreview(l.text || "", 240);

      return `
        <div class="lessonCard">
          <div class="lessonTop">
            <div style="min-width:0;">
              <h3 class="lessonTitle">${esc((idx+1)+". "+title)}</h3>
              <div class="badges">
                <span class="pill">${esc(level)}</span>
                <span class="pill">📌 Cours premium</span>
                ${seen ? `<span class="pill" style="background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.35)">✅ Vu</span>` : ``}
              </div>
              <div class="preview">${esc(preview)}</div>
            </div>
            <button class="openBtn" data-open="${idx}">Ouvrir</button>
          </div>
        </div>
      `;
    }).join("");

  } else if (tab==="qcm"){
    list.innerHTML = `
      <div class="lessonCard">
        <h3 class="lessonTitle">🧪 QCM</h3>
        <div class="preview">Lance une question aléatoire ou parcourt la série.</div>
        <div class="audioBar" style="margin-top:12px;">
          <button class="btn primary" id="qcmRandom">Question aléatoire</button>
          <button class="btn ghost" id="qcmStart">Parcourir</button>
        </div>
      </div>
    `;
    $("#qcmRandom")?.addEventListener("click", ()=>{
      if (!filtered.length) return;
      openItem(Math.floor(Math.random()*filtered.length));
    });
    $("#qcmStart")?.addEventListener("click", ()=> openItem(0));

  } else {
    list.innerHTML = filtered.map((c,idx)=>{
      return `
        <div class="lessonCard">
          <div class="lessonTop">
            <div style="min-width:0;">
              <h3 class="lessonTitle">${esc((idx+1)+". "+(c.title||"Cas pratique"))}</h3>
              <div class="badges">
                <span class="pill">${esc(c.level || "—")}</span>
                <span class="pill">🧾 Cas</span>
              </div>
              <div class="preview">${esc(shortPreview(c.question || "", 260))}</div>
            </div>
            <button class="openBtn" data-open="${idx}">Ouvrir</button>
          </div>
        </div>
      `;
    }).join("");
  }

  list.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click", ()=> openItem(parseInt(btn.getAttribute("data-open"),10)));
  });
}

// ---------- Open item in modal
function openItem(i){
  currentIndex = clamp(i, 0, Math.max(0, filtered.length-1));
  const item = filtered[currentIndex];
  if (!item) return;

  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");

  modalPos.textContent = `${currentIndex+1}/${filtered.length}`;
  modalLevel.textContent = (tab==="lessons" ? (item.level||"—") : (item.level||"—"));

  if (tab==="lessons"){
    renderLesson(item);
    markSeen(item);
  } else if (tab==="qcm"){
    renderQcm(item);
  } else {
    renderCase(item);
  }

  prevBtn.onclick = ()=> openItem(currentIndex-1);
  nextBtn.onclick = ()=> openItem(currentIndex+1);
}

function closeModal(){
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden","true");
  stopSpeech();
}

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e)=>{ if (e.target === modal) closeModal(); });

// ---------- Lessons rendering (sections + TOC + Audio)
function splitSections(text){
  // Sections by headings like "OBJECTIF:", "EXPLICATION:", etc.
  const raw = (text || "").trim();
  if (!raw) return [{ title: "CONTENU", body: "" }];

  const lines = raw.split("\n");
  const markers = [
    "OBJECTIF", "EXPLICATION", "EXEMPLE", "À RETENIR", "A RETENIR", "PIÈGES", "PIEGES",
    "MÉTHODE", "METHODE", "CHECKLIST", "MINI-EXERCICE", "EXERCICE", "RÉSUMÉ", "RESUME"
  ];

  const sections = [];
  let cur = { title: "CONTENU", body: "" };

  function pushCur(){
    if (cur.body.trim() || cur.title !== "CONTENU") sections.push({ ...cur, body: cur.body.trim() });
  }

  for (const ln of lines){
    const clean = ln.trim();
    const m = clean.replace(/:$/,"");
    const isMarker = markers.includes(m.toUpperCase());
    if (isMarker){
      pushCur();
      cur = { title: m.toUpperCase().replace("A RETENIR","À RETENIR"), body: "" };
    } else {
      cur.body += (cur.body ? "\n" : "") + ln;
    }
  }
  pushCur();

  // If nothing detected => single section
  if (sections.length === 0) return [{ title: "CONTENU", body: raw }];
  return sections;
}

function renderLesson(l){
  const title = l.title || "Cours";
  const sections = splitSections(l.text || "");

  // TOC + Audio controls
  const toc = `
    <div class="toc">
      <div class="secTitle">SOMMAIRE RAPIDE</div>
      ${sections.map((s,idx)=> `<a href="#sec_${idx}" data-scroll="${idx}">${esc(s.title)}</a>`).join("")}
      <div class="audioBar">
        <button class="btn primary" id="audPlay">▶ Lecture</button>
        <button class="btn ghost" id="audPause">⏸ Pause</button>
        <button class="btn ghost" id="audStop">⏹ Stop</button>
        <div class="range">
          <span>Vitesse</span>
          <input id="audRate" type="range" min="0.8" max="1.4" step="0.1" value="${speechRate}">
          <span class="kbd" id="audRateVal">${speechRate.toFixed(1)}x</span>
        </div>
      </div>
      <div class="hint" style="margin-top:12px;">
        Astuce : la lecture audio fonctionne même hors ligne (TTS du téléphone). Si aucune voix ne sort, change la voix/synthèse dans les réglages système.
      </div>
    </div>
  `;

  modalBody.innerHTML = `
    <h2 style="margin:6px 0 0;font-size:26px;line-height:1.15;font-weight:950;">${esc(title)}</h2>
    ${toc}
    ${sections.map((s,idx)=>`
      <div class="sec" id="sec_${idx}">
        <div class="secTitle">${esc(s.title)}</div>
        <div class="secText">${esc(s.body)}</div>
      </div>
    `).join("")}
  `;

  // TOC scroll
  modalBody.querySelectorAll("[data-scroll]").forEach(a=>{
    a.addEventListener("click", (e)=>{
      e.preventDefault();
      const idx = parseInt(a.getAttribute("data-scroll"),10);
      const el = modalBody.querySelector(`#sec_${idx}`);
      if (el) el.scrollIntoView({ behavior:"smooth", block:"start" });
    });
  });

  // Audio
  $("#audPlay")?.addEventListener("click", ()=> speakText(stripForSpeech(l.text || title)));
  $("#audPause")?.addEventListener("click", togglePause);
  $("#audStop")?.addEventListener("click", stopSpeech);

  $("#audRate")?.addEventListener("input", (e)=>{
    speechRate = parseFloat(e.target.value);
    $("#audRateVal").textContent = `${speechRate.toFixed(1)}x`;
    // si déjà en train de parler, on relance proprement
    if (speaking && utter){
      const current = utter.text;
      stopSpeech();
      speakText(current);
    }
  });

  // Menu button in modal => remonte au sommaire
  modalMenu.onclick = ()=>{
    const tocEl = modalBody.querySelector(".toc");
    if (tocEl) tocEl.scrollIntoView({ behavior:"smooth", block:"start" });
  };
}

function stripForSpeech(text){
  return (text || "")
    .replace(/#+\s*/g,"")
    .replace(/[•\-\*]\s*/g,"")
    .replace(/\s+/g," ")
    .trim();
}

function speakText(text){
  if (!("speechSynthesis" in window)) {
    alert("Audio non supporté sur ce navigateur.");
    return;
  }
  stopSpeech();

  utter = new SpeechSynthesisUtterance(text);
  utter.lang = "fr-FR";
  utter.rate = speechRate;

  utter.onstart = ()=>{ speaking=true; paused=false; };
  utter.onend = ()=>{ speaking=false; paused=false; utter=null; };
  utter.onerror = ()=>{ speaking=false; paused=false; utter=null; };

  window.speechSynthesis.speak(utter);
}

function togglePause(){
  if (!("speechSynthesis" in window)) return;
  if (!speaking) return;

  if (!paused){
    window.speechSynthesis.pause();
    paused = true;
  }else{
    window.speechSynthesis.resume();
    paused = false;
  }
}

function stopSpeech(){
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  speaking=false;
  paused=false;
  utter=null;
}

// Progress: mark seen
function markSeen(lesson){
  const id = lesson.id || lesson.title || "lesson";
  const p = loadProgress();
  const modKey = activeModule.id;
  if (!p[modKey]) p[modKey] = { seen:{}, last:null };
  p[modKey].seen[id] = Date.now();
  p[modKey].last = id;
  saveProgress(p);
}

// ---------- QCM
function renderQcm(q){
  const question = q.question || "Question";
  const choices = q.choices || [];
  const answer = q.answer;
  const explain = q.explain || "";

  modalBody.innerHTML = `
    <h2 style="margin:6px 0 0;font-size:24px;line-height:1.15;font-weight:950;">${esc(question)}</h2>
    <div class="sec">
      <div class="secTitle">CHOIX</div>
      <div class="secText" id="qcmChoices">
        ${choices.map((c,i)=>`<button class="btn ghost" style="width:100%;margin-top:10px;text-align:left;" data-choice="${i}">
          ${esc((i+1)+". "+c)}
        </button>`).join("")}
      </div>
    </div>
    <div class="sec" id="qcmResult" style="display:none;"></div>
  `;

  modalMenu.onclick = null;

  modalBody.querySelectorAll("[data-choice]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const i = parseInt(b.getAttribute("data-choice"),10);
      const ok = (i === answer);

      const box = $("#qcmResult");
      box.style.display = "block";
      box.innerHTML = `
        <div class="secTitle">${ok ? "✅ BONNE RÉPONSE" : "❌ MAUVAISE RÉPONSE"}</div>
        <div class="secText">
          ${esc(ok ? "Parfait." : `La bonne réponse est : ${answer+1}. ${choices[answer] || ""}`)}
          ${explain ? "\n\n" + esc(explain) : ""}
        </div>
      `;
    });
  });
}

// ---------- Cases
function renderCase(c){
  modalBody.innerHTML = `
    <h2 style="margin:6px 0 0;font-size:24px;line-height:1.15;font-weight:950;">${esc(c.title || "Cas pratique")}</h2>

    <div class="sec">
      <div class="secTitle">QUESTION</div>
      <div class="secText">${esc(c.question || "")}</div>
    </div>

    <div class="sec">
      <div class="secTitle">RÉPONSE (cabinet)</div>
      <div class="secText">${esc((c.answer_md || "").replace(/\\n/g,"\n"))}</div>
    </div>
  `;
  modalMenu.onclick = null;
}

// ---------- Force refresh
async function forceRefresh(){
  try{
    // Clear SW caches
    if ("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
    // Unregister SW
    if ("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
  }catch(e){
    console.warn(e);
  }
  location.reload(true);
}

// ---------- Init
async function init(){
  buildNum.textContent = String(APP_BUILD);
  setOnlinePill();

  // Update cache-bust placeholders in HTML-loaded links won't auto update,
  // but BUILD is shown and SW uses CACHE_NAME for hard refresh when needed.

  btnMenu.addEventListener("click", openDrawer);
  btnClose.addEventListener("click", closeDrawer);
  navModules.addEventListener("click", ()=>{ closeDrawer(); renderModules(); });
  navForceRefresh.addEventListener("click", ()=>{ closeDrawer(); forceRefresh(); });

  // close drawer on outside tap
  document.addEventListener("click", (e)=>{
    if (!drawer.classList.contains("open")) return;
    const inDrawer = drawer.contains(e.target);
    const inBtn = btnMenu.contains(e.target);
    if (!inDrawer && !inBtn) closeDrawer();
  });

  await registerSW();

  // Load db_index.json
  try{
    dbIndex = await fetchJson("db_index.json");
  }catch(e){
    console.error(e);
    app.innerHTML = `
      <div class="h1">Erreur</div>
      <div class="card block" style="margin-top:14px;">
        <div class="lessonTitle">Impossible de charger db_index.json</div>
        <div class="preview">Vérifie le fichier à la racine du repo et le chemin GitHub Pages.</div>
        <button class="btn primary" id="tryAgain">Réessayer</button>
      </div>
    `;
    $("#tryAgain")?.addEventListener("click", ()=>location.reload());
    return;
  }

  renderModules();
}

init();