/* =========================================================
   FiscoPilot — Cabinet Pro (PWA/SPA simple)
   - Drawer premium (no peeking)
   - Pages: Dashboard, Modules, Quiz, Examen, Prof IA, Flashcards, Stats, Paramètres
   - Reads db/tva.json (and future db/isoc.json, db/ipp.json)
   ========================================================= */

const APP = {
  brand: "FiscoPilot",
  tag: "AI ELITE MAX",
  flag: "🇧🇪",
  modulesIndex: [
    { id: "tva", title: "TVA Belgique", file: "db/tva.json", icon: "📚", priority: 1 },
    // Future:
    // { id: "isoc", title: "ISOC", file: "db/isoc.json", icon: "🏢", priority: 2 },
    // { id: "ipp", title: "IPP", file: "db/ipp.json", icon: "👤", priority: 3 },
  ],
  state: {
    route: "dashboard",
    moduleId: "tva",
    data: {},              // loaded module JSON
    view: "courses",       // courses | qcm | cas
    courseIndex: 0,
    qcmRun: null,          // { items: [], i:0, score:0, done:false }
    casIndex: 0,
    sync: { ok: true, date: "2026-01-01" },
  },
};

// ---------- Utils ----------
const $ = (sel) => document.querySelector(sel);

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function randInt(max){ return Math.floor(Math.random() * max); }

function levelToBadge(level){
  const L = String(level || "").toLowerCase();
  if(L.includes("début") || L.includes("debut")) return { cls: "deb", txt: "Débutant" };
  if(L.includes("inter")) return { cls: "int", txt: "Intermédiaire" };
  if(L.includes("avan")) return { cls: "adv", txt: "Avancé" };
  if(L.includes("expert")) return { cls: "exp", txt: "Expert" };
  return null;
}

function normalizeCourses(raw){
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((c, idx) => {
    if(typeof c === "string"){
      return { title: c, content: "", level: "Débutant", order: idx+1 };
    }
    return {
      title: c.title || c.titre || `Cours ${idx+1}`,
      content: c.content || c.texte || c.body || "",
      level: c.level || c.niveau || "Intermédiaire",
      order: c.order || idx+1,
    };
  });
}

function normalizeQcm(raw){
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((q, idx) => {
    // expected: {q, choices, answer, explanation}
    if(typeof q === "string"){
      return { q, choices: ["Vrai", "Faux"], answer: 0, explanation: "" };
    }
    const choices = q.choices || q.options || q.a || [];
    return {
      q: q.q || q.question || `Question ${idx+1}`,
      choices: Array.isArray(choices) ? choices : [],
      answer: (q.answer ?? q.correct ?? 0),
      explanation: q.explanation || q.correction || q.explication || "",
    };
  });
}

function normalizeCases(raw){
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((c, idx) => {
    if(typeof c === "string"){
      return { question: c, answer: "" };
    }
    return {
      question: c.question || c.q || `Cas ${idx+1}`,
      answer: c.answer || c.correction || c.a || "",
    };
  });
}

async function loadModule(moduleId){
  const m = APP.modulesIndex.find(x => x.id === moduleId) || APP.modulesIndex[0];
  APP.state.moduleId = m.id;

  // cache localStorage (offline)
  const cacheKey = `fp_cache_${m.id}`;
  const cached = localStorage.getItem(cacheKey);
  if(cached){
    try { APP.state.data[m.id] = JSON.parse(cached); } catch {}
  }

  try{
    const res = await fetch(m.file, { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    APP.state.data[m.id] = json;
    localStorage.setItem(cacheKey, JSON.stringify(json));
    APP.state.sync = { ok: true, date: (json.updated_at || json.date || "2026-01-01") };
  }catch(e){
    // offline fallback
    APP.state.sync = { ok: false, date: (APP.state.data[m.id]?.updated_at || "—") };
  }
}

// ---------- Router ----------
function setRoute(route){
  APP.state.route = route;
  window.location.hash = `#/${route}`;
  render();
}

function initRouter(){
  const h = window.location.hash || "#/dashboard";
  const route = h.replace("#/","").split("?")[0] || "dashboard";
  APP.state.route = route;
  window.addEventListener("hashchange", () => {
    const hh = window.location.hash || "#/dashboard";
    APP.state.route = hh.replace("#/","").split("?")[0] || "dashboard";
    render();
  });
}

// ---------- UI Shell ----------
function iconMenu(){
  return `
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function shell(){
  const route = APP.state.route;
  const nav = [
    ["dashboard","Dashboard","🏠"],
    ["modules","Modules","📚"],
    ["quiz","Quiz","🧪"],
    ["examen","Examen","📝"],
    ["tutor","Prof IA","🤖"],
    ["flashcards","Flashcards","🧠"],
    ["stats","Stats","📊"],
    ["settings","Paramètres","⚙️"],
  ];

  return `
  <div class="app">
    <header class="header">
      <div class="header-row">
        <div class="brand">
          <div class="title">${esc(APP.brand)}</div>
          <div class="tag">${esc(APP.tag)}</div>
          <div class="flag">${APP.flag}</div>
        </div>
        <button class="icon-btn" id="btnDrawer" aria-label="Menu">${iconMenu()}</button>
      </div>
    </header>

    <div class="drawer-overlay" id="drawerOverlay"></div>
    <aside class="drawer" id="drawer">
      <div class="brand" style="padding:6px 6px 0 6px;">
        <div class="title">${esc(APP.brand)}</div>
        <div class="tag">${esc(APP.tag)}</div>
        <div class="flag">${APP.flag}</div>
      </div>
      <nav class="nav" id="nav">
        ${nav.map(([r,label,ico]) => `
          <a href="#/${r}" data-route="${r}">
            <div class="nav-item ${route===r ? "active":""}">
              <div class="label">${ico} ${esc(label)}</div>
              <div style="opacity:.5;">›</div>
            </div>
          </a>
        `).join("")}
      </nav>
      <div class="drawer-footer">
        Mode: <b>${APP.state.sync.ok ? "Sync OK" : "Local (offline)"}</b>
        <div>Dernière maj: ${esc(APP.state.sync.date)}</div>
      </div>
    </aside>

    <main class="main safe-bottom" id="main"></main>
  </div>
  `;
}

function drawerOpen(on){
  const d = $("#drawer");
  const o = $("#drawerOverlay");
  if(on){
    d.classList.add("open");
    o.classList.add("open");
  }else{
    d.classList.remove("open");
    o.classList.remove("open");
  }
}

function bindShellEvents(){
  $("#btnDrawer")?.addEventListener("click", () => drawerOpen(true));
  $("#drawerOverlay")?.addEventListener("click", () => drawerOpen(false));

  // close drawer on nav click
  document.querySelectorAll("#nav a").forEach(a => {
    a.addEventListener("click", () => drawerOpen(false));
  });

  // swipe / escape optional
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape") drawerOpen(false);
  });
}

// ---------- Pages ----------
function pageDashboard(){
  const sync = APP.state.sync;
  return `
    <div class="section">
      <div class="h1">Dashboard</div>
      <div class="sub">Plan de révision ITAA — version “Cabinet Pro”.</div>

      <div class="card pad">
        <div class="row">
          <div class="meta">
            <span class="chip">${sync.ok ? "✅ Sync OK" : "⚠️ Offline (mode local)"}</span>
            <span class="chip">Dernière maj: ${esc(sync.date)}</span>
          </div>
          <div class="btns">
            <button class="btn primary small" id="btnSync">Mettre à jour</button>
          </div>
        </div>

        <div class="hr"></div>

        <div class="notice">
          <div>💡</div>
          <div>
            <b>Méthode cabinet :</b> on consolide d’abord <b>TVA</b>, ensuite <b>ISOC</b> puis <b>IPP</b>.
            Chaque module contient : cours structurés, QCM, cas pratiques.
          </div>
        </div>

        <div class="hr"></div>

        <div class="btns">
          <button class="btn primary" id="goModules">Ouvrir Modules</button>
          <button class="btn" id="goQuiz">Lancer un QCM</button>
          <button class="btn" id="goCas">Cas aléatoire</button>
        </div>
      </div>
    </div>
  `;
}

function pageModules(){
  const modules = APP.modulesIndex.slice().sort((a,b)=>a.priority-b.priority);
  return `
    <div class="section">
      <div class="h1">Modules</div>
      <div class="sub">Choisis un module — progression logique (priorité TVA).</div>

      <div class="list">
        ${modules.map(m => `
          <div class="item" data-mod="${m.id}">
            <div class="left">
              <div class="t">${m.icon} ${esc(m.title)}</div>
              <div class="d">${esc(m.file)}</div>
            </div>
            <div style="opacity:.6;font-weight:900;">›</div>
          </div>
        `).join("")}
      </div>

      <div class="card pad soft" style="margin-top:12px;">
        <div class="notice">
          <div>📌</div>
          <div>
            Tu es en mode gratuit : les données viennent des fichiers <b>db/*.json</b> (offline friendly).
            On peut augmenter la base “max” ensuite, sans casser l’app.
          </div>
        </div>
      </div>
    </div>
  `;
}

function pageModuleDetail(){
  const m = APP.modulesIndex.find(x=>x.id===APP.state.moduleId) || APP.modulesIndex[0];
  const json = APP.state.data[m.id] || {};
  const courses = normalizeCourses(json.courses || json.cours);
  const qcm = normalizeQcm(json.qcm || json.questions);
  const cas = normalizeCases(json.cases || json.cas);

  const cIdx = clamp(APP.state.courseIndex, 0, Math.max(0, courses.length-1));
  APP.state.courseIndex = cIdx;

  const current = courses[cIdx] || { title:"", content:"", level:"Intermédiaire" };
  const badge = levelToBadge(current.level);

  const headline = `
    <div class="card pad">
      <div class="row">
        <div>
          <div style="font-weight:900;font-size:18px;">${esc(m.title)}</div>
          <div class="meta">
            <span class="chip">Source: ${esc(m.file)}</span>
            <span class="chip">📚 Cours: ${courses.length}</span>
            <span class="chip">🧪 QCM: ${qcm.length}</span>
            <span class="chip">📝 Cas: ${cas.length}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const controls = `
    <div class="card pad" style="margin-top:12px;">
      <div class="row">
        <div class="btns">
          <button class="btn primary small" id="btnCourseRand">Cours aléatoire</button>
          <button class="btn small" id="btnPrev">◀ Précédent</button>
          <button class="btn small" id="btnNext">Suivant ▶</button>
        </div>
      </div>

      <div class="hr"></div>

      <div class="list" id="courseList">
        ${courses.slice(0, 12).map((c,i)=> {
          const b = levelToBadge(c.level);
          const isActive = i === cIdx;
          return `
            <div class="item" data-course="${i}" style="${isActive ? "border-color: rgba(59,130,246,.35); background: rgba(59,130,246,.10);" : ""}">
              <div class="left">
                <div class="t">${esc(i+1)}. ${esc(c.title)}</div>
                <div class="d">${esc(c.level || "")}</div>
              </div>
              ${b ? `<div class="badge ${b.cls}">${esc(b.txt)}</div>` : `<div style="opacity:.6;">›</div>`}
            </div>
          `;
        }).join("")}
        ${courses.length > 12 ? `<div class="notice" style="margin-top:6px;">📌 … +${courses.length-12} autres cours (utilise Précédent/Suivant ou Aléatoire)</div>` : ""}
      </div>

      <div class="hr"></div>

      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="font-weight:950;">(${cIdx+1}/${courses.length}) ${esc(current.title)}</div>
        ${badge ? `<div class="badge ${badge.cls}">${esc(badge.txt)}</div>` : ""}
      </div>

      <div class="content" style="margin-top:10px;">${esc(current.content || "Contenu à enrichir (on va le faire “max”).")}</div>
    </div>
  `;

  const qcmBlock = `
    <div class="card pad" style="margin-top:12px;">
      <div style="font-weight:950;margin-bottom:10px;">🧪 QCM</div>
      <div class="btns">
        <button class="btn primary small" id="btnQcm5">Lancer 5 questions (aléatoire)</button>
        <button class="btn small" id="btnQcm10">Lancer 10 questions (aléatoire)</button>
      </div>
      <div class="hr"></div>
      <div id="qcmArea" class="content" style="color:var(--muted);">Appuie sur “Lancer” pour démarrer un QCM aléatoire.</div>
    </div>
  `;

  const casBlock = `
    <div class="card pad" style="margin-top:12px;">
      <div style="font-weight:950;margin-bottom:10px;">📝 Cas pratiques</div>
      <div class="btns">
        <button class="btn primary small" id="btnCasRand">Cas aléatoire</button>
      </div>
      <div class="hr"></div>
      <div id="casArea" class="content" style="color:var(--muted);">Appuie sur “Cas aléatoire”.</div>
      <div class="btns" style="margin-top:10px;">
        <button class="btn small" id="btnCasShow">Voir correction</button>
      </div>
    </div>
  `;

  return `
    <div class="section">
      ${headline}
      ${controls}
      ${qcmBlock}
      ${casBlock}
      <div class="btns" style="margin-top:12px;">
        <button class="btn ghost" id="backModules">← Retour aux modules</button>
      </div>
    </div>
  `;
}

function pageSimple(title, subtitle){
  return `
    <div class="section">
      <div class="h1">${esc(title)}</div>
      <div class="sub">${esc(subtitle)}</div>
      <div class="card pad">
        <div class="notice">
          <div>🧩</div>
          <div>Cette page est prête côté interface. On la branchera ensuite (quand TVA sera consolidée).</div>
        </div>
        <div class="hr"></div>
        <button class="btn primary" id="goModules2">Ouvrir Modules</button>
      </div>
    </div>
  `;
}

// ---------- Render ----------
function renderMain(){
  const r = APP.state.route;

  if(r === "dashboard") return pageDashboard();
  if(r === "modules") return pageModules();

  // detail module = reuse modules route but open module view
  if(r === "module") return pageModuleDetail();

  if(r === "quiz") return pageSimple("Quiz", "QCM multi-modules et statistiques (bientôt).");
  if(r === "examen") return pageSimple("Examen blanc", "Mode ITAA : chrono + correction structurée (bientôt).");
  if(r === "tutor") return pageSimple("Prof IA", "On fera une version gratuite + une version en ligne plus puissante.");
  if(r === "flashcards") return pageSimple("Flashcards", "Spaced repetition (Leitner) — à venir.");
  if(r === "stats") return pageSimple("Stats", "Streaks, badges, suivi de progrès — à venir.");
  if(r === "settings") return pageSimple("Paramètres", "Thème, stockage, sauvegarde — à venir.");

  return pageDashboard();
}

function bindPageEvents(){
  const r = APP.state.route;

  if(r === "dashboard"){
    $("#btnSync")?.addEventListener("click", async () => {
      await loadModule(APP.state.moduleId);
      render();
    });
    $("#goModules")?.addEventListener("click", () => setRoute("modules"));
    $("#goQuiz")?.addEventListener("click", () => {
      setRoute("module"); // start from module view for now
      setTimeout(()=> $("#btnQcm5")?.click(), 50);
    });
    $("#goCas")?.addEventListener("click", () => {
      setRoute("module");
      setTimeout(()=> $("#btnCasRand")?.click(), 50);
    });
  }

  if(r === "modules"){
    document.querySelectorAll("[data-mod]").forEach(el => {
      el.addEventListener("click", async () => {
        const id = el.getAttribute("data-mod");
        await loadModule(id);
        APP.state.courseIndex = 0;
        APP.state.qcmRun = null;
        APP.state.casIndex = 0;
        setRoute("module");
      });
    });
  }

  if(r === "module"){
    const m = APP.modulesIndex.find(x=>x.id===APP.state.moduleId) || APP.modulesIndex[0];
    const json = APP.state.data[m.id] || {};
    const courses = normalizeCourses(json.courses || json.cours);
    const qcm = normalizeQcm(json.qcm || json.questions);
    const cas = normalizeCases(json.cases || json.cas);

    $("#backModules")?.addEventListener("click", () => setRoute("modules"));

    // Courses controls
    $("#btnPrev")?.addEventListener("click", () => {
      APP.state.courseIndex = clamp(APP.state.courseIndex - 1, 0, Math.max(0, courses.length-1));
      render();
    });
    $("#btnNext")?.addEventListener("click", () => {
      APP.state.courseIndex = clamp(APP.state.courseIndex + 1, 0, Math.max(0, courses.length-1));
      render();
    });
    $("#btnCourseRand")?.addEventListener("click", () => {
      if(courses.length){
        APP.state.courseIndex = randInt(courses.length);
        render();
      }
    });
    document.querySelectorAll("[data-course]").forEach(el => {
      el.addEventListener("click", () => {
        const i = parseInt(el.getAttribute("data-course"), 10);
        if(Number.isFinite(i)){
          APP.state.courseIndex = clamp(i, 0, Math.max(0, courses.length-1));
          render();
        }
      });
    });

    // QCM
    function startQcm(n){
      if(!qcm.length){
        $("#qcmArea").innerHTML = `<div class="notice">⚠️ Pas encore de QCM dans ce module.</div>`;
        return;
      }
      const count = clamp(n, 1, qcm.length);
      // sample without replacement
      const idxs = [...Array(qcm.length)].map((_,i)=>i);
      idxs.sort(()=>Math.random()-0.5);
      const pick = idxs.slice(0,count).map(i=>qcm[i]);
      APP.state.qcmRun = { items: pick, i: 0, score: 0, done:false, answered:false };
      renderQcm();
    }

    function renderQcm(){
      const run = APP.state.qcmRun;
      if(!run){
        $("#qcmArea").innerHTML = `<div style="color:var(--muted)">Appuie sur “Lancer” pour démarrer un QCM aléatoire.</div>`;
        return;
      }
      const item = run.items[run.i];
      const total = run.items.length;

      const opts = (item.choices || []).map((c, idx)=>`
        <div class="item" data-opt="${idx}">
          <div class="left">
            <div class="t">${esc(c)}</div>
            <div class="d">Choix ${idx+1}</div>
          </div>
          <div style="opacity:.6;">›</div>
        </div>
      `).join("");

      $("#qcmArea").innerHTML = `
        <div class="meta" style="margin-bottom:8px;">
          <span class="chip">Question ${run.i+1}/${total}</span>
          <span class="chip">Score: ${run.score}/${total}</span>
        </div>
        <div style="font-weight:950;margin-bottom:10px;">${esc(item.q)}</div>
        <div class="list" id="optList">${opts}</div>
        <div class="btns" style="margin-top:10px;">
          <button class="btn small" id="qPrev" ${run.i===0?"disabled":""}>◀</button>
          <button class="btn small" id="qNext">${run.i===total-1?"Terminer":"▶"}</button>
        </div>
        <div id="qExplain" style="margin-top:10px;"></div>
      `;

      // click options
      document.querySelectorAll("#optList [data-opt]").forEach(el=>{
        el.addEventListener("click", ()=>{
          if(run.answered) return;
          run.answered = true;
          const chosen = parseInt(el.getAttribute("data-opt"),10);
          const ok = chosen === Number(item.answer);
          if(ok) run.score++;

          // style correct/incorrect
          document.querySelectorAll("#optList [data-opt]").forEach(x=>{
            const idx = parseInt(x.getAttribute("data-opt"),10);
            if(idx === Number(item.answer)){
              x.style.borderColor = "rgba(34,197,94,.45)";
              x.style.background = "rgba(34,197,94,.12)";
            }else if(idx === chosen){
              x.style.borderColor = "rgba(239,68,68,.45)";
              x.style.background = "rgba(239,68,68,.10)";
            }
          });

          $("#qExplain").innerHTML = `
            <div class="notice">
              <div>${ok ? "✅" : "❌"}</div>
              <div>
                <b>${ok ? "Bonne réponse." : "Réponse incorrecte."}</b>
                ${item.explanation ? `<div style="margin-top:6px;color:var(--muted)">${esc(item.explanation)}</div>` : ""}
              </div>
            </div>
          `;
        });
      });

      $("#qPrev")?.addEventListener("click", ()=>{
        run.i = clamp(run.i-1, 0, total-1);
        run.answered = false;
        renderQcm();
      });
      $("#qNext")?.addEventListener("click", ()=>{
        if(run.i === total-1){
          $("#qcmArea").innerHTML = `
            <div class="notice">
              <div>🏁</div>
              <div><b>QCM terminé</b><div style="margin-top:6px;">Score final : <b>${run.score}/${total}</b></div></div>
            </div>
          `;
          APP.state.qcmRun = null;
          return;
        }
        run.i = clamp(run.i+1, 0, total-1);
        run.answered = false;
        renderQcm();
      });
    }

    $("#btnQcm5")?.addEventListener("click", ()=> startQcm(5));
    $("#btnQcm10")?.addEventListener("click", ()=> startQcm(10));
    // if already running, restore
    if(APP.state.qcmRun) renderQcm();

    // Cas
    function showCas(i){
      if(!cas.length){
        $("#casArea").innerHTML = `<div class="notice">⚠️ Pas encore de cas dans ce module.</div>`;
        return;
      }
      APP.state.casIndex = clamp(i, 0, cas.length-1);
      const c = cas[APP.state.casIndex];
      $("#casArea").innerHTML = `
        <div class="meta" style="margin-bottom:8px;">
          <span class="chip">Cas ${APP.state.casIndex+1}/${cas.length}</span>
        </div>
        <div style="font-weight:950;margin-bottom:8px;">Question</div>
        <div class="content">${esc(c.question)}</div>
        <div id="casAnswer" style="margin-top:10px;"></div>
      `;
      $("#btnCasShow")?.onclick = () => {
        $("#casAnswer").innerHTML = `
          <div class="notice">
            <div>✅</div>
            <div><b>Correction</b>
              ${c.answer ? `<div style="margin-top:6px;color:var(--muted)">${esc(c.answer)}</div>` : `<div style="margin-top:6px;color:var(--muted)">Correction à compléter.</div>`}
            </div>
          </div>
        `;
      };
    }

    $("#btnCasRand")?.addEventListener("click", ()=>{
      if(cas.length){
        showCas(randInt(cas.length));
      }
    });
    // ensure button exists even before random
    $("#btnCasShow")?.addEventListener("click", ()=>{});
  }

  // simple pages
  if(["quiz","examen","tutor","flashcards","stats","settings"].includes(r)){
    $("#goModules2")?.addEventListener("click", ()=> setRoute("modules"));
  }
}

async function render(){
  // first time shell
  if(!$("#root")){
    document.body.innerHTML = `<div id="root"></div>`;
  }
  $("#root").innerHTML = shell();
  bindShellEvents();

  // Ensure module loaded once
  const currentModule = APP.state.moduleId || "tva";
  if(!APP.state.data[currentModule]){
    await loadModule(currentModule);
  }

  $("#main").innerHTML = renderMain();
  bindPageEvents();
}

// ---------- Boot ----------
(async function boot(){
  initRouter();

  // If user directly opens /module, load default and show module
  if(APP.state.route === "module"){
    await loadModule(APP.state.moduleId);
  }

  // If user opens /modules, show list, else dashboard
  if(!["dashboard","modules","module","quiz","examen","tutor","flashcards","stats","settings"].includes(APP.state.route)){
    APP.state.route = "dashboard";
    window.location.hash = "#/dashboard";
  }

  await render();

  // quick deep link: when clicking module list go to module page
  // also allow open module directly from dashboard buttons
})();