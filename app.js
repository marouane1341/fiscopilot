/* =========================
   FiscoPilot STABLE APP
   - Chargement modules depuis db_index.json
   - Module -> Cours / QCM / Cas
   - Modal + navigation
   - Audio gratuit : speechSynthesis (voix dépend Samsung)
   - Zéro crash "onclick null" (guards partout)
   ========================= */

const APP_BUILD = 102; // incrémente quand tu changes app.js/json
const DB_INDEX = "db_index.json";

const $ = (sel, root=document) => root.querySelector(sel);

const state = {
  modules: [],
  currentModule: null,
  data: { lessons: [], qcm: [], cases: [] },
  tab: "cours", // cours | qcm | cas
  search: "",
  modal: {
    open: false,
    type: null, // cours|qcm|cas
    list: [],
    index: 0
  },
  tts: {
    enabled: true,
    speaking: false,
    voice: null
  }
};

function toast(msg){
  const el = $("#toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.classList.remove("show"), 1800);
}

function setOnlinePill(){
  const pill = $("#netPill");
  if(!pill) return;
  if(navigator.onLine){
    pill.textContent = "En ligne";
    pill.classList.add("online");
  } else {
    pill.textContent = "Hors ligne";
    pill.classList.remove("online");
  }
}

async function fetchJSON(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`Fetch failed: ${url}`);
  return await r.json();
}

function normalizeLevel(level){
  const s = (level || "").toString().trim();
  if(!s) return "Débutant";
  return s;
}

function textPreview(txt, max=150){
  const s = (txt||"").replace(/\s+/g," ").trim();
  return s.length > max ? s.slice(0, max-1) + "…" : s;
}

function parseLessonText(text){
  // On découpe par titres connus : OBJECTIF / EXPLICATION / MÉTHODE / EXEMPLE / À RETENIR / MINI-EXERCICE / CONTENU
  const raw = (text||"").replace(/\r/g,"").trim();
  if(!raw) return [{ title:"CONTENU", body:"(vide)" }];

  const known = [
    "OBJECTIF","EXPLICATION","MÉTHODE CABINET","METHODE CABINET","MÉTHODE","METHODE",
    "EXEMPLE","À RETENIR","A RETENIR","MINI-EXERCICE","MINI EXERCICE","CONTENU"
  ];

  const lines = raw.split("\n");
  const blocks = [];
  let cur = { title: "CONTENU", body: "" };

  for(const line of lines){
    const t = line.trim();
    const upper = t.toUpperCase();
    const isHeader = known.some(k => upper === k);
    if(isHeader){
      if(cur.body.trim()) blocks.push(cur);
      cur = { title: upper.replace("A RETENIR","À RETENIR").replace("METHODE","MÉTHODE"), body: "" };
    } else {
      cur.body += (cur.body ? "\n" : "") + line;
    }
  }
  if(cur.body.trim()) blocks.push(cur);

  // Si tout est dans un seul bloc, on garde
  return blocks.length ? blocks : [{ title:"CONTENU", body: raw }];
}

/* =========================
   UI RENDER
   ========================= */

function render(){
  const app = $("#app");
  if(!app) return;

  if(!state.currentModule){
    // page modules
    app.innerHTML = `
      <section class="card">
        <h1 class="h1">Modules</h1>
        <p class="sub">Choisis un module. Les cours premium ont un objectif, une explication claire, des exemples et “à retenir”.</p>
        <div class="list" id="moduleList"></div>
      </section>
    `;
    const list = $("#moduleList");
    if(list){
      list.innerHTML = state.modules.map(m => `
        <div class="item">
          <div class="itemTop">
            <div>
              <div class="moduleTitle">📚 ${escapeHTML(m.title || m.id)}</div>
              <div class="mini">${(m.sources||[]).join(", ")}</div>
              <div class="tags"><span class="tag">📦 Sources: ${(m.sources||[]).length}</span></div>
            </div>
            <button class="btn small" data-open-module="${escapeHTML(m.id)}">Ouvrir</button>
          </div>
        </div>
      `).join("");
    }
    bindModuleButtons();
    return;
  }

  // page module
  const counts = {
    cours: state.data.lessons.length,
    qcm: state.data.qcm.length,
    cas: state.data.cases.length
  };

  app.innerHTML = `
    <section class="card">
      <div class="moduleRow">
        <div>
          <h2 class="moduleTitle">📘 ${escapeHTML(state.currentModule.title || state.currentModule.id)}</h2>
          <div class="mini">Cours: ${counts.cours} • QCM: ${counts.qcm} • Cas: ${counts.cas}</div>
          <div class="mini">${(state.currentModule.sources||[]).join(", ")}</div>
        </div>
        <button class="btn ghost" id="backModules">← Retour</button>
      </div>

      <div class="tabs">
        <button class="tab ${state.tab==="cours"?"active":""}" data-tab="cours">📘 Cours</button>
        <button class="tab ${state.tab==="qcm"?"active":""}" data-tab="qcm">🧪 QCM</button>
        <button class="tab ${state.tab==="cas"?"active":""}" data-tab="cas">🧾 Cas</button>
      </div>

      <div class="searchRow">
        <input class="search" id="search" placeholder="Rechercher (ex: prorata, facture, intracom)" value="${escapeAttr(state.search)}" />
        <button class="btn" id="randomBtn">Aléatoire</button>
      </div>

      <div class="list" id="items"></div>
    </section>
  `;

  bindModuleUI();
  renderItems();
}

function renderItems(){
  const box = $("#items");
  if(!box) return;

  const q = state.search.trim().toLowerCase();
  const tab = state.tab;

  let items = [];
  if(tab === "cours") items = state.data.lessons.map(x => ({...x, _type:"cours"}));
  if(tab === "qcm") items = state.data.qcm.map((x,i) => ({...x, _type:"qcm", _id: `qcm_${i}`}));
  if(tab === "cas") items = state.data.cases.map((x,i) => ({...x, _type:"cas", _id: `cas_${i}`}));

  if(q){
    items = items.filter(it => {
      const hay = JSON.stringify(it).toLowerCase();
      return hay.includes(q);
    });
  }

  if(!items.length){
    box.innerHTML = `<div class="item"><div class="mini">Aucun résultat.</div></div>`;
    return;
  }

  box.innerHTML = items.map((it, idx) => {
    if(it._type === "cours"){
      const level = normalizeLevel(it.level);
      const tagClass = level.toLowerCase().includes("début") ? "" : (level.toLowerCase().includes("expert") ? "bad" : "warn");
      return `
        <div class="item">
          <div class="itemTop">
            <div style="flex:1; min-width:0;">
              <h3 class="itemTitle">${escapeHTML(it.title || "Cours")}</h3>
              <div class="tags">
                <span class="tag dot ${tagClass}">${escapeHTML(level)}</span>
                <span class="tag">📌 Cours premium</span>
              </div>
              <div class="preview">${escapeHTML(textPreview(it.text||""))}</div>
            </div>
            <button class="btn ghost" data-open-item="cours" data-index="${idx}">Ouvrir</button>
          </div>
        </div>
      `;
    }

    if(it._type === "qcm"){
      return `
        <div class="item">
          <div class="itemTop">
            <div style="flex:1; min-width:0;">
              <h3 class="itemTitle">${escapeHTML(it.question || "Question")}</h3>
              <div class="tags"><span class="tag">🧪 QCM</span></div>
              <div class="preview">${escapeHTML(textPreview((it.choices||[]).join(" • ")))}</div>
            </div>
            <button class="btn ghost" data-open-item="qcm" data-index="${idx}">Ouvrir</button>
          </div>
        </div>
      `;
    }

    // cas
    return `
      <div class="item">
        <div class="itemTop">
          <div style="flex:1; min-width:0;">
            <h3 class="itemTitle">${escapeHTML(it.title || "Cas")}</h3>
            <div class="tags"><span class="tag">🧾 Cas</span></div>
            <div class="preview">${escapeHTML(textPreview(it.question || ""))}</div>
          </div>
          <button class="btn ghost" data-open-item="cas" data-index="${idx}">Ouvrir</button>
        </div>
      </div>
    `;
  }).join("");

  bindOpenItemButtons();
}

/* =========================
   MODAL
   ========================= */

function openModal(type, list, index){
  state.modal.open = true;
  state.modal.type = type;
  state.modal.list = list;
  state.modal.index = index;

  const m = $("#modal");
  if(m){
    m.classList.add("open");
    m.setAttribute("aria-hidden","false");
  }
  renderModal();
}

function closeModal(){
  stopTTS();
  state.modal.open = false;
  const m = $("#modal");
  if(m){
    m.classList.remove("open");
    m.setAttribute("aria-hidden","true");
  }
}

function renderModal(){
  const body = $("#modalBody");
  const pos = $("#modalPos");
  const lvl = $("#modalLevel");
  if(!body || !pos || !lvl) return;

  const { type, list } = state.modal;
  const i = clamp(state.modal.index, 0, Math.max(0, list.length-1));
  state.modal.index = i;

  pos.textContent = `${i+1}/${list.length}`;

  const item = list[i];
  lvl.textContent = (type === "cours") ? normalizeLevel(item.level) : (type === "qcm" ? "QCM" : "Cas");

  if(type === "cours"){
    const blocks = parseLessonText(item.text || "");
    body.innerHTML = `
      <h2 class="itemTitle" style="margin:0 0 12px;">${escapeHTML(item.title || "Cours")}</h2>
      ${blocks.map(b => `
        <div class="block">
          <div class="blockTitle">${escapeHTML(b.title)}</div>
          <p class="blockText">${escapeHTML(b.body.trim())}</p>
        </div>
      `).join("")}
    `;
    return;
  }

  if(type === "qcm"){
    body.innerHTML = `
      <h2 class="itemTitle" style="margin:0 0 12px;">${escapeHTML(item.question || "QCM")}</h2>

      <div class="block">
        <div class="blockTitle">CHOISISSEZ</div>
        <div class="blockText">
          ${(item.choices||[]).map((c, idx) => `
            <div style="margin:10px 0;">
              <button class="navBtn" style="width:100%;" data-qcm-choice="${idx}">
                ${idx+1}) ${escapeHTML(c)}
              </button>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="block" id="qcmExplain" style="display:none;">
        <div class="blockTitle">EXPLICATION</div>
        <p class="blockText" id="qcmExplainTxt"></p>
      </div>
    `;

    // bind choices
    body.querySelectorAll("[data-qcm-choice]").forEach(btn => {
      btn.addEventListener("click", () => {
        const chosen = Number(btn.getAttribute("data-qcm-choice"));
        const ok = chosen === Number(item.answer);
        toast(ok ? "✅ Bonne réponse" : "❌ Pas correct");
        const ex = $("#qcmExplain");
        const exTxt = $("#qcmExplainTxt");
        if(ex && exTxt){
          exTxt.textContent = item.explain || "";
          ex.style.display = "block";
        }
      });
    });
    return;
  }

  // cas
  body.innerHTML = `
    <h2 class="itemTitle" style="margin:0 0 12px;">${escapeHTML(item.title || "Cas")}</h2>
    <div class="block">
      <div class="blockTitle">QUESTION</div>
      <p class="blockText">${escapeHTML(item.question || "")}</p>
    </div>

    <div class="block">
      <div class="blockTitle">RÉPONSE</div>
      <p class="blockText" id="caseAnswer" style="display:none;"></p>
      <button class="btn ghost" id="showAnswer">Afficher la réponse</button>
    </div>
  `;

  const show = $("#showAnswer");
  const ans = $("#caseAnswer");
  if(show && ans){
    show.addEventListener("click", () => {
      ans.textContent = (item.answer_md || "").replace(/\s+/g," ").trim();
      ans.style.display = "block";
      show.style.display = "none";
    });
  }
}

function modalNext(){
  stopTTS();
  state.modal.index = clamp(state.modal.index + 1, 0, state.modal.list.length - 1);
  renderModal();
}
function modalPrev(){
  stopTTS();
  state.modal.index = clamp(state.modal.index - 1, 0, state.modal.list.length - 1);
  renderModal();
}

/* =========================
   AUDIO (TTS) - gratuit
   ========================= */

function initVoices(){
  if(!("speechSynthesis" in window)) return;
  const pick = () => {
    const voices = window.speechSynthesis.getVoices() || [];
    // Choisir la meilleure voix FR disponible (Samsung/Chrome = souvent Google FR)
    const fr = voices.filter(v => (v.lang||"").toLowerCase().startsWith("fr"));
    const prefer = ["Google", "Microsoft", "Samsung", "Apple"];
    let best = null;
    for(const p of prefer){
      best = fr.find(v => (v.name||"").includes(p));
      if(best) break;
    }
    if(!best) best = fr[0] || voices[0] || null;
    state.tts.voice = best;
  };
  pick();
  window.speechSynthesis.onvoiceschanged = pick;
}

function getSpeakTextFromModal(){
  const body = $("#modalBody");
  if(!body) return "";
  const txt = body.innerText || "";
  return txt.replace(/\s+\n/g,"\n").trim();
}

function speakModal(){
  if(!("speechSynthesis" in window)){
    toast("Audio non supporté sur ce navigateur.");
    return;
  }
  try{
    const text = getSpeakTextFromModal();
    if(!text){
      toast("Rien à lire.");
      return;
    }

    // toggle: si déjà en train de parler -> stop
    if(state.tts.speaking){
      stopTTS();
      toast("⏹️ Audio arrêté");
      return;
    }

    stopTTS(); // clean

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    if(state.tts.voice) u.voice = state.tts.voice;

    // réglages “plus humain” (selon voix dispo)
    u.rate = 0.95;
    u.pitch = 1.0;
    u.volume = 1.0;

    u.onstart = () => { state.tts.speaking = true; };
    u.onend = () => { state.tts.speaking = false; };
    u.onerror = () => { state.tts.speaking = false; toast("Erreur audio."); };

    window.speechSynthesis.speak(u);
    toast("🔊 Audio…");
  }catch(e){
    state.tts.speaking = false;
    toast("Erreur audio.");
  }
}

function stopTTS(){
  if(!("speechSynthesis" in window)) return;
  try{
    window.speechSynthesis.cancel();
  }catch(_){}
  state.tts.speaking = false;
}

/* =========================
   EVENTS / BINDINGS
   ========================= */

function bindModuleButtons(){
  document.querySelectorAll("[data-open-module]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-open-module");
      const mod = state.modules.find(m => m.id === id);
      if(!mod){ toast("Module introuvable."); return; }
      await openModule(mod);
    });
  });
}

function bindModuleUI(){
  const back = $("#backModules");
  if(back) back.onclick = () => {
    state.currentModule = null;
    state.data = { lessons:[], qcm:[], cases:[] };
    state.tab = "cours";
    state.search = "";
    render();
  };

  document.querySelectorAll("[data-tab]").forEach(t => {
    t.addEventListener("click", () => {
      state.tab = t.getAttribute("data-tab");
      state.search = "";
      render();
    });
  });

  const s = $("#search");
  if(s){
    s.addEventListener("input", () => {
      state.search = s.value || "";
      renderItems();
    });
  }

  const rnd = $("#randomBtn");
  if(rnd){
    rnd.onclick = () => {
      let list = [];
      if(state.tab==="cours") list = state.data.lessons;
      if(state.tab==="qcm") list = state.data.qcm;
      if(state.tab==="cas") list = state.data.cases;
      if(!list.length){ toast("Aucun élément."); return; }
      const idx = Math.floor(Math.random() * list.length);
      openModal(state.tab, list, idx);
    };
  }
}

function bindOpenItemButtons(){
  document.querySelectorAll("[data-open-item]").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-open-item");
      const idx = Number(btn.getAttribute("data-index") || "0");
      let list = [];
      if(type==="cours") list = state.data.lessons;
      if(type==="qcm") list = state.data.qcm;
      if(type==="cas") list = state.data.cases;
      openModal(type, list, idx);
    });
  });
}

function bindGlobalUI(){
  const build = $("#buildNum");
  if(build) build.textContent = String(APP_BUILD);

  const btnMenu = $("#btnMenu");
  const drawer = $("#drawer");
  const btnClose = $("#btnClose");
  const navModules = $("#navModules");
  const navForce = $("#navForceRefresh");

  const openDrawer = () => {
    if(!drawer) return;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden","false");
  };
  const closeDrawer = () => {
    if(!drawer) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden","true");
  };

  if(btnMenu) btnMenu.onclick = openDrawer;
  if(btnClose) btnClose.onclick = closeDrawer;

  if(navModules) navModules.onclick = () => { closeDrawer(); state.currentModule=null; render(); };

  if(navForce) navForce.onclick = async () => {
    closeDrawer();
    toast("Refresh…");
    try{
      // Recharger modules + si module ouvert recharger data
      await initData(true);
      if(state.currentModule){
        await openModule(state.currentModule, true);
      } else {
        render();
      }
      toast("✅ OK");
    }catch(e){
      toast("Erreur refresh");
    }
  };

  // Modal controls
  const modal = $("#modal");
  const modalClose = $("#modalClose");
  const prevBtn = $("#prevBtn");
  const nextBtn = $("#nextBtn");
  const ttsBtn = $("#ttsBtn");

  if(modalClose) modalClose.onclick = closeModal;
  if(prevBtn) prevBtn.onclick = modalPrev;
  if(nextBtn) nextBtn.onclick = modalNext;
  if(ttsBtn) ttsBtn.onclick = speakModal;

  if(modal){
    modal.addEventListener("click", (e) => {
      if(e.target === modal) closeModal();
    });
  }

  // Network pill
  window.addEventListener("online", setOnlinePill);
  window.addEventListener("offline", setOnlinePill);
  setOnlinePill();
}

/* =========================
   DATA
   ========================= */

async function initData(force=false){
  // Charge db_index.json
  state.modules = (await fetchJSON(DB_INDEX)).modules || [];
  if(!Array.isArray(state.modules)) state.modules = [];
}

async function openModule(mod, force=false){
  state.currentModule = mod;

  // Charger et fusionner les sources JSON
  const sources = mod.sources || [];
  const merged = { lessons: [], qcm: [], cases: [] };

  for(const src of sources){
    const data = await fetchJSON(src);
    if(Array.isArray(data.lessons)) merged.lessons.push(...data.lessons);
    if(Array.isArray(data.qcm)) merged.qcm.push(...data.qcm);
    if(Array.isArray(data.cases)) merged.cases.push(...data.cases);
  }

  state.data = merged;
  state.tab = "cours";
  state.search = "";
  render();
}

/* =========================
   UTIL
   ========================= */

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

function escapeHTML(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(s){
  return escapeHTML(s).replaceAll("\n"," ");
}

/* =========================
   INIT
   ========================= */

async function main(){
  initVoices();

  // register SW (si dispo)
  if("serviceWorker" in navigator){
    try{
      await navigator.serviceWorker.register("sw.js");
    }catch(_){}
  }

  bindGlobalUI();

  try{
    await initData();
    render();
  }catch(e){
    const app = $("#app");
    if(app){
      app.innerHTML = `
        <div class="card">
          <h2 class="moduleTitle">Erreur</h2>
          <p class="sub">${escapeHTML(String(e.message || e))}</p>
          <button class="btn" onclick="location.reload()">Recharger</button>
        </div>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", main);