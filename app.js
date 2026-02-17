/* FiscoPilot — Premium Reader + TVA Massive
   Works with:
   - db_index.json at repo root
   - db/*.json sources listed in db_index.json
*/

const APP_BUILD = "2026-02-16-v12"; // change to force refresh if needed

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const state = {
  online: navigator.onLine,
  view: "modules", // modules | module
  modules: [],
  activeModule: null,
  data: { lessons: [], qcm: [], cases: [] },
  tab: "lessons", // lessons | qcm | cases
  lessonIndex: 0,
  focusMode: false,
  drawerOpen: false,
  modalOpen: false,
  qcmSession: null, // {items, idx, score}
};

function relUrl(path){
  // robust for /fiscopilot/ on GH Pages
  return new URL(path, window.location.href).toString();
}
function bust(url){
  const u = new URL(url);
  u.searchParams.set("v", APP_BUILD);
  return u.toString();
}

function levelDot(levelStr=""){
  const s = (levelStr||"").toLowerCase();
  if (s.includes("début") || s.includes("debut")) return "beg";
  if (s.includes("inter")) return "int";
  if (s.includes("avan")) return "adv";
  if (s.includes("expert") || s.includes("🔴")) return "exp";
  return "int";
}

function parseLessonText(raw=""){
  // Accept either plain text or structured headings in text.
  // We transform into premium sections.
  // Supported markers (case-insensitive):
  // OBJECTIF:, EXPLICATION:, EXEMPLE:, PIEGES:, CHECKLIST:, A RETENIR:
  const txt = (raw || "").replace(/\r/g, "");
  const blocks = [];
  const markers = [
    { key: "OBJECTIF", icon: "🎯", title: "Objectif" },
    { key: "EXPLICATION", icon: "🧠", title: "Explication" },
    { key: "EXEMPLE", icon: "📌", title: "Exemple" },
    { key: "PIÈGES", icon: "⚠️", title: "Pièges" },
    { key: "PIEGES", icon: "⚠️", title: "Pièges" },
    { key: "CHECKLIST", icon: "✅", title: "Checklist" },
    { key: "A RETENIR", icon: "🧾", title: "À retenir" },
    { key: "À RETENIR", icon: "🧾", title: "À retenir" },
  ];

  // If no markers -> make a single "Explication"
  const hasMarker = markers.some(m => new RegExp(`^\\s*${m.key}\\s*:`, "mi").test(txt));
  if (!hasMarker){
    return [{ title: "🧠 Explication", body: txt.trim() }];
  }

  // Split by markers while keeping order
  let remaining = txt;
  // Find all marker occurrences with index
  const hits = [];
  markers.forEach(m=>{
    const re = new RegExp(`^\\s*${m.key}\\s*:`, "gmi");
    let match;
    while ((match = re.exec(txt)) !== null){
      hits.push({ idx: match.index, marker: m });
    }
  });
  hits.sort((a,b)=>a.idx-b.idx);

  for (let i=0;i<hits.length;i++){
    const start = hits[i].idx;
    const end = (i+1<hits.length) ? hits[i+1].idx : txt.length;
    const slice = txt.slice(start, end).trim();
    const m = hits[i].marker;
    const body = slice.replace(new RegExp(`^\\s*${m.key}\\s*:\\s*`, "i"), "").trim();
    blocks.push({ title: `${m.icon} ${m.title}`, body });
  }

  return blocks.filter(b => (b.body||"").trim().length>0);
}

function mergeSources(jsons){
  const lessons = [];
  const qcm = [];
  const cases = [];
  for (const j of jsons){
    if (!j) continue;
    if (Array.isArray(j.lessons)) lessons.push(...j.lessons);
    if (Array.isArray(j.qcm)) qcm.push(...j.qcm);
    if (Array.isArray(j.cases)) cases.push(...j.cases);
  }
  // De-dup by id/title
  const seenLesson = new Set();
  const lessons2 = [];
  for (const l of lessons){
    const k = (l.id || l.title || JSON.stringify(l)).toString();
    if (seenLesson.has(k)) continue;
    seenLesson.add(k);
    lessons2.push(l);
  }
  return { lessons: lessons2, qcm, cases };
}

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function htmlEscape(s){
  return (s??"").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function render(){
  $("#app").innerHTML = `
    <div class="safe-area">
      ${renderTopbar()}
      <div class="container">
        ${state.view === "modules" ? renderModules() : renderModule()}
      </div>
      ${renderDrawer()}
      ${renderModal()}
      ${renderFab()}
    </div>
  `;

  bindEvents();
}

function renderTopbar(){
  return `
    <div class="topbar">
      <div class="topbar-inner">
        <button class="iconbtn" id="btnMenu" aria-label="Menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>

        <div class="brand">
          <div>FiscoPilot<span class="sub">AI ELITE MAX</span> 🇧🇪</div>
        </div>

        <div class="spacer"></div>

        <div class="pill small ${state.online ? "good" : "warn"}" id="netPill">
          <span class="dot ${state.online ? "beg" : "int"}"></span>
          <span>${state.online ? "En ligne" : "Hors ligne"}</span>
        </div>
      </div>
    </div>
  `;
}

function renderModules(){
  const cards = state.modules.map(m => `
    <div class="card">
      <div class="hd">
        <div style="font-weight:950; font-size:18px;">📚 ${htmlEscape(m.title || m.id)}</div>
        <div class="spacer"></div>
        <button class="pillbtn primary" data-open-module="${htmlEscape(m.id)}">Ouvrir</button>
      </div>
      <div class="bd">
        <div class="muted2">Sources: ${(m.sources||[]).map(s=>htmlEscape(s)).join(", ")}</div>
      </div>
    </div>
  `).join("");

  return `
    <div class="hero">
      <div class="h1">Modules</div>
      <div class="muted">Mode PWA • Offline-ready</div>
    </div>

    <div class="grid two">
      <div class="grid">
        ${cards || `
          <div class="card"><div class="bd">
            <div class="muted">Aucun module trouvé.</div>
            <div class="muted2">Vérifie <b>db_index.json</b>.</div>
          </div></div>
        `}
      </div>

      <div class="card soft">
        <div class="hd">
          <div style="font-weight:950;">🚀 Objectif</div>
        </div>
        <div class="bd">
          <div class="muted2" style="line-height:1.7">
            Cette version vise une UX “formation premium” :
            lecture plein écran, sections structurées, progression, sommaire rapide,
            et sessions QCM/Cas en mode pratique.
          </div>
          <hr class="sep"/>
          <div class="muted2 smallnote">
            Astuce cache : si tu modifies les JSON, incrémente <b>APP_BUILD</b> dans <b>app.js</b> et <b>CACHE_NAME</b> dans <b>sw.js</b>.
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderModule(){
  const m = state.activeModule;
  if (!m){
    state.view = "modules";
    return renderModules();
  }

  const { lessons, qcm, cases } = state.data;

  return `
    <div class="hero">
      <div class="h2">Modules</div>
      <div class="h1" style="margin-top:8px;">${htmlEscape(m.title || m.id)}</div>
      <div class="muted2">
        Cours: <b>${lessons.length}</b> • QCM: <b>${qcm.length}</b> • Cas: <b>${cases.length}</b>
      </div>
      <div class="muted2" style="margin-top:6px;">
        Sources: ${(m.sources||[]).map(s=>htmlEscape(s)).join(", ")}
      </div>
    </div>

    <div class="grid two">
      <div class="card">
        <div class="hd">
          <div class="tabs" style="width:100%;">
            <button class="tab ${state.tab==="lessons"?"active":""}" data-tab="lessons">📘 Cours</button>
            <button class="tab ${state.tab==="qcm"?"active":""}" data-tab="qcm">🧪 QCM</button>
            <button class="tab ${state.tab==="cases"?"active":""}" data-tab="cases">🧾 Cas</button>
          </div>
        </div>

        <div class="bd">
          ${state.tab==="lessons" ? renderLessonsList() : ""}
          ${state.tab==="qcm" ? renderQcmPanel() : ""}
          ${state.tab==="cases" ? renderCasesPanel() : ""}

          <div style="margin-top:14px;">
            <button class="btn ghost" id="btnBackModules">← Retour aux modules</button>
          </div>
        </div>
      </div>

      <div class="card soft">
        <div class="hd">
          <div style="font-weight:950;">✨ Premium Tips</div>
        </div>
        <div class="bd">
          <div class="muted2" style="line-height:1.7">
            - “Sommaire rapide” dans le lecteur<br/>
            - Mode Focus pour lecture longue<br/>
            - Progression visible (anti-scroll fatigue)<br/>
            - QCM en session (score + correction)<br/>
          </div>
          <hr class="sep"/>
          <div class="muted2 smallnote">
            Si quelque chose “redevient ancien”, c’est le cache PWA. Incrémente <b>CACHE_NAME</b> et <b>APP_BUILD</b>.
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLessonsList(){
  const lessons = state.data.lessons || [];
  if (!lessons.length) return `<div class="muted">Aucun cours.</div>`;

  const topActions = `
    <div class="btnrow" style="margin-bottom:12px;">
      <button class="btn primary" id="btnLessonRandom">Cours aléatoire</button>
      <button class="btn" id="btnLessonPrev">◀ Précédent</button>
      <button class="btn" id="btnLessonNext">Suivant ▶</button>
    </div>
  `;

  const list = lessons.slice(0, 18).map((l, idx)=>`
    <div class="item">
      <div class="left">
        <div class="title">${idx+1}. ${htmlEscape(l.title || "Cours")}</div>
        <div class="meta">
          <span class="badge"><span class="dot ${levelDot(l.level)}"></span>${htmlEscape(l.level || "Intermédiaire")}</span>
          ${l.id ? `<span class="muted2">#${htmlEscape(l.id)}</span>` : ``}
        </div>
      </div>
      <div class="action">
        <button class="pillbtn primary" data-open-lesson="${idx}">Ouvrir</button>
      </div>
    </div>
  `).join("");

  const more = lessons.length > 18
    ? `<div class="muted2" style="margin-top:10px;">… ${lessons.length-18} autres cours (utilise Précédent/Suivant ou Aléatoire)</div>`
    : ``;

  return `
    ${topActions}
    <div class="list">${list}</div>
    ${more}
  `;
}

function renderQcmPanel(){
  const total = (state.data.qcm || []).length;
  if (!total) return `<div class="muted">Aucun QCM.</div>`;

  return `
    <div class="btnrow" style="margin-bottom:12px;">
      <button class="btn primary" data-start-qcm="5">Lancer 5 questions (aléatoire)</button>
      <button class="btn" data-start-qcm="10">Lancer 10 questions (aléatoire)</button>
      <button class="btn" data-start-qcm="20">Lancer 20 questions (aléatoire)</button>
    </div>
    <div class="muted2">Total disponible: <b>${total}</b> questions.</div>
  `;
}

function renderCasesPanel(){
  const total = (state.data.cases || []).length;
  if (!total) return `<div class="muted">Aucun cas pratique.</div>`;

  return `
    <div class="btnrow" style="margin-bottom:12px;">
      <button class="btn primary" id="btnCaseRandom">Cas aléatoire</button>
    </div>
    <div class="muted2">Total disponible: <b>${total}</b> cas.</div>
  `;
}

function renderDrawer(){
  return `
    <div class="drawer ${state.drawerOpen ? "show" : ""}" id="drawer">
      <div class="backdrop" id="drawerBackdrop"></div>
      <div class="panel">
        <div class="brand" style="margin-top:6px;">
          <div style="font-size:18px;">FiscoPilot<span class="sub">AI ELITE MAX</span> 🇧🇪</div>
        </div>
        <div class="smallnote" style="margin-top:10px;">
          Menu (interface premium). Tu peux brancher d’autres modules ensuite (ISOC/IPP).
        </div>
        <div class="nav">
          <button class="navbtn" data-nav="modules">🏠 Dashboard</button>
          <button class="navbtn" data-nav="modules">📚 Modules</button>
          <button class="navbtn" data-nav="module" ${state.activeModule ? "" : "disabled"}>📘 TVA (module actif)</button>
          <button class="navbtn" id="btnForceRefresh">🔄 Forcer refresh</button>
        </div>
      </div>
    </div>
  `;
}

function renderModal(){
  if (!state.modalOpen) return `<div class="modal" id="modal"></div>`;

  const lessons = state.data.lessons || [];
  const l = lessons[state.lessonIndex];

  // QCM session view
  if (state.qcmSession){
    const sess = state.qcmSession;
    const item = sess.items[sess.idx];

    const pct = Math.round(((sess.idx) / sess.items.length) * 100);
    const done = sess.idx >= sess.items.length;

    return `
      <div class="modal show" id="modal">
        <div class="backdrop" id="modalBackdrop"></div>
        <div class="sheet ${state.focusMode ? "focus":""}">
          <div class="sheetbar">
            <button class="iconbtn" id="btnModalClose" aria-label="Fermer">✕</button>
            <div class="title">🧪 QCM — session (${Math.min(sess.idx+1, sess.items.length)}/${sess.items.length})</div>
            <div class="spacer"></div>
            <button class="pillbtn" id="btnFocus">${state.focusMode ? "Quitter focus" : "Mode focus"}</button>
          </div>

          <div class="content">
            <div class="progress"><div style="width:${done?100:pct}%;"></div></div>
            <div class="muted2" style="margin-top:10px;">
              Score: <b>${sess.score}</b> / ${sess.items.length}
            </div>

            ${done ? `
              <div class="section" style="margin-top:14px;">
                <h3>🏁 Résultat</h3>
                <p>Session terminée. Score final : <b>${sess.score}/${sess.items.length}</b>.</p>
                <div class="btnrow" style="margin-top:10px;">
                  <button class="btn primary" id="btnRestartQcm">Rejouer (nouveau tirage)</button>
                  <button class="btn" id="btnModalClose2">Fermer</button>
                </div>
              </div>
            ` : `
              <div class="section" style="margin-top:14px;">
                <h3>Question</h3>
                <p style="font-size:18px;font-weight:850;">${htmlEscape(item.question)}</p>
              </div>

              <div class="section">
                <h3>Réponses</h3>
                <div class="qcm">
                  ${(item.choices||[]).map((c, i)=>`
                    <div class="choice" data-qcm-choice="${i}">${htmlEscape(c)}</div>
                  `).join("")}
                </div>
              </div>

              <div class="section" id="qcmExplain" style="display:none;">
                <h3>Correction</h3>
                <p class="hint" id="qcmExplainText"></p>
                <div class="btnrow" style="margin-top:10px;">
                  <button class="btn primary" id="btnQcmNext">Suivant ▶</button>
                </div>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  // Case modal view
  if (state.modalMode === "case"){
    const c = state.activeCase;
    return `
      <div class="modal show" id="modal">
        <div class="backdrop" id="modalBackdrop"></div>
        <div class="sheet ${state.focusMode ? "focus":""}">
          <div class="sheetbar">
            <button class="iconbtn" id="btnModalClose" aria-label="Fermer">✕</button>
            <div class="title">🧾 Cas pratique — ${htmlEscape(c.title || "Cas")}</div>
            <div class="spacer"></div>
            <button class="pillbtn" id="btnFocus">${state.focusMode ? "Quitter focus" : "Mode focus"}</button>
          </div>

          <div class="content">
            <div class="section">
              <h3>🧾 Question</h3>
              <p>${htmlEscape(c.question || "")}</p>
            </div>

            <div class="section">
              <h3>✅ Correction (structure cabinet)</h3>
              <p style="white-space:pre-wrap;">${htmlEscape(c.answer_md || "")}</p>
            </div>

            <div class="btnrow" style="margin-top:14px;">
              <button class="btn primary" id="btnCaseRandom2">Nouveau cas aléatoire</button>
              <button class="btn" id="btnModalClose2">Fermer</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (!l){
    return `
      <div class="modal show" id="modal">
        <div class="backdrop" id="modalBackdrop"></div>
        <div class="sheet">
          <div class="sheetbar">
            <button class="iconbtn" id="btnModalClose" aria-label="Fermer">✕</button>
            <div class="title">Cours introuvable</div>
          </div>
          <div class="content"><div class="muted">Impossible d’ouvrir ce cours.</div></div>
        </div>
      </div>
    `;
  }

  const blocks = parseLessonText(l.text || l.body || "");
  const pct = Math.round(((state.lessonIndex+1)/lessons.length)*100);

  return `
    <div class="modal show" id="modal">
      <div class="backdrop" id="modalBackdrop"></div>
      <div class="sheet ${state.focusMode ? "focus":""}">
        <div class="sheetbar">
          <button class="iconbtn" id="btnModalClose" aria-label="Fermer">✕</button>
          <div class="title">${htmlEscape(l.title || "Cours")}</div>
          <div class="spacer"></div>
          <button class="pillbtn" id="btnFocus">${state.focusMode ? "Quitter focus" : "Mode focus"}</button>
        </div>

        <div class="content" id="lessonContent">
          <div class="progress"><div style="width:${pct}%;"></div></div>
          <div class="muted2" style="margin-top:10px;">
            ${state.lessonIndex+1}/${lessons.length} • <b>${htmlEscape(l.level || "Intermédiaire")}</b>
          </div>

          <div class="toc">
            ${blocks.map((b, i)=>`<button data-toc="${i}">${htmlEscape(b.title)}</button>`).join("")}
          </div>

          ${blocks.map((b,i)=>`
            <div class="section" data-section="${i}">
              <h3>${htmlEscape(b.title)}</h3>
              <div style="white-space:pre-wrap; line-height:1.75;">${htmlEscape(b.body)}</div>
            </div>
          `).join("")}

          <div class="btnrow" style="margin-top:14px;">
            <button class="btn" id="btnLessonPrev2">◀ Précédent</button>
            <button class="btn primary" id="btnLessonNext2">Suivant ▶</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFab(){
  return `
    <div class="fab ${state.modalOpen ? "show" : ""}" id="fab">
      <button class="btn primary" id="btnToc">Sommaire rapide</button>
    </div>
  `;
}

function bindEvents(){
  const btnMenu = $("#btnMenu");
  if (btnMenu) btnMenu.onclick = () => { state.drawerOpen = true; render(); };

  const backdrop = $("#drawerBackdrop");
  if (backdrop) backdrop.onclick = () => { state.drawerOpen = false; render(); };

  $$(".navbtn").forEach(b=>{
    b.onclick = () => {
      const nav = b.dataset.nav;
      if (nav === "modules"){
        state.view = "modules";
        state.activeModule = null;
        state.drawerOpen = false;
        render();
      }
      if (nav === "module" && state.activeModule){
        state.view = "module";
        state.drawerOpen = false;
        render();
      }
    };
  });

  const btnForceRefresh = $("#btnForceRefresh");
  if (btnForceRefresh) btnForceRefresh.onclick = async () => {
    try{
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      if (regs && regs.length){
        for (const r of regs) await r.unregister();
      }
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }catch(e){}
    location.reload(true);
  };

  $("[data-open-module]")?.addEventListener?.("click", ()=>{});
  $$("[data-open-module]").forEach(btn=>{
    btn.onclick = () => openModule(btn.dataset.openModule);
  });

  const btnBackModules = $("#btnBackModules");
  if (btnBackModules) btnBackModules.onclick = () => { state.view="modules"; state.activeModule=null; render(); };

  $$("[data-tab]").forEach(t=>{
    t.onclick = () => { state.tab = t.dataset.tab; render(); };
  });

  const btnLessonRandom = $("#btnLessonRandom");
  if (btnLessonRandom) btnLessonRandom.onclick = () => {
    state.lessonIndex = Math.floor(Math.random()*state.data.lessons.length);
    openLesson(state.lessonIndex);
  };
  const btnLessonPrev = $("#btnLessonPrev");
  if (btnLessonPrev) btnLessonPrev.onclick = () => {
    const n = state.data.lessons.length;
    state.lessonIndex = (state.lessonIndex - 1 + n) % n;
    openLesson(state.lessonIndex);
  };
  const btnLessonNext = $("#btnLessonNext");
  if (btnLessonNext) btnLessonNext.onclick = () => {
    const n = state.data.lessons.length;
    state.lessonIndex = (state.lessonIndex + 1) % n;
    openLesson(state.lessonIndex);
  };

  $$("[data-open-lesson]").forEach(b=>{
    b.onclick = () => openLesson(parseInt(b.dataset.openLesson,10));
  });

  $$("[data-start-qcm]").forEach(b=>{
    b.onclick = () => startQcm(parseInt(b.dataset.startQcm,10));
  });

  const btnCaseRandom = $("#btnCaseRandom");
  if (btnCaseRandom) btnCaseRandom.onclick = () => openRandomCase();

  // Modal interactions
  const modalBackdrop = $("#modalBackdrop");
  if (modalBackdrop) modalBackdrop.onclick = () => closeModal();

  const btnModalClose = $("#btnModalClose");
  if (btnModalClose) btnModalClose.onclick = () => closeModal();
  const btnModalClose2 = $("#btnModalClose2");
  if (btnModalClose2) btnModalClose2.onclick = () => closeModal();

  const btnFocus = $("#btnFocus");
  if (btnFocus) btnFocus.onclick = () => { state.focusMode = !state.focusMode; render(); };

  // Lesson prev/next from modal
  const btnLessonPrev2 = $("#btnLessonPrev2");
  if (btnLessonPrev2) btnLessonPrev2.onclick = () => {
    const n = state.data.lessons.length;
    state.lessonIndex = (state.lessonIndex - 1 + n) % n;
    render();
  };
  const btnLessonNext2 = $("#btnLessonNext2");
  if (btnLessonNext2) btnLessonNext2.onclick = () => {
    const n = state.data.lessons.length;
    state.lessonIndex = (state.lessonIndex + 1) % n;
    render();
  };

  // TOC buttons
  $$("[data-toc]").forEach(btn=>{
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.toc,10);
      const target = $(`[data-section="${idx}"]`);
      if (target) target.scrollIntoView({behavior:"smooth", block:"start"});
    };
  });

  // Floating TOC: scroll to top toc
  const btnToc = $("#btnToc");
  if (btnToc) btnToc.onclick = () => {
    const toc = $(".toc");
    if (toc) toc.scrollIntoView({behavior:"smooth", block:"start"});
  };

  // QCM choices
  $$("[data-qcm-choice]").forEach(el=>{
    el.onclick = () => handleQcmChoice(parseInt(el.dataset.qcmChoice,10));
  });
  const btnQcmNext = $("#btnQcmNext");
  if (btnQcmNext) btnQcmNext.onclick = () => qcmNext();

  const btnRestartQcm = $("#btnRestartQcm");
  if (btnRestartQcm) btnRestartQcm.onclick = () => {
    const n = state.qcmSession?.items?.length || 10;
    startQcm(n);
  };

  const btnCaseRandom2 = $("#btnCaseRandom2");
  if (btnCaseRandom2) btnCaseRandom2.onclick = () => openRandomCase();
}

function openLesson(idx){
  state.lessonIndex = idx;
  state.modalOpen = true;
  state.modalMode = "lesson";
  state.qcmSession = null;
  state.activeCase = null;
  render();
}

function openRandomCase(){
  const cs = state.data.cases || [];
  const c = cs[Math.floor(Math.random()*cs.length)];
  state.modalOpen = true;
  state.modalMode = "case";
  state.activeCase = c;
  state.qcmSession = null;
  render();
}

function startQcm(n){
  const all = state.data.qcm || [];
  const items = shuffle(all).slice(0, Math.min(n, all.length));
  state.qcmSession = { items, idx: 0, score: 0, locked: false };
  state.modalOpen = true;
  state.modalMode = "qcm";
  state.focusMode = false;
  render();
}

function handleQcmChoice(choiceIdx){
  const sess = state.qcmSession;
  if (!sess || sess.locked) return;

  const item = sess.items[sess.idx];
  const correct = item.answer;

  sess.locked = true;

  // mark choices
  $$("[data-qcm-choice]").forEach(el=>{
    const i = parseInt(el.dataset.qcmChoice,10);
    if (i === correct) el.classList.add("good");
    else if (i === choiceIdx) el.classList.add("bad");
  });

  if (choiceIdx === correct) sess.score++;

  const explain = $("#qcmExplain");
  const explainText = $("#qcmExplainText");
  if (explain && explainText){
    explainText.textContent = item.explain || "Correction : garde le raisonnement structuré + preuves.";
    explain.style.display = "block";
    explain.scrollIntoView({behavior:"smooth", block:"start"});
  }
}

function qcmNext(){
  const sess = state.qcmSession;
  if (!sess) return;
  sess.idx++;
  sess.locked = false;
  render();
}

function closeModal(){
  state.modalOpen = false;
  state.focusMode = false;
  state.qcmSession = null;
  state.activeCase = null;
  render();
}

async function openModule(moduleId){
  const m = state.modules.find(x => x.id === moduleId);
  if (!m) return;

  state.activeModule = m;
  state.view = "module";
  state.tab = "lessons";
  state.modalOpen = false;
  state.qcmSession = null;

  // Load sources and merge
  const srcUrls = (m.sources || []).map(s => bust(relUrl(s)));
  try{
    const jsons = await Promise.all(srcUrls.map(async (u)=>{
      const r = await fetch(u, { cache:"no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }));
    state.data = mergeSources(jsons);

    // Sort lessons by (optional) order in id or keep as is
    state.lessonIndex = 0;
    render();
  }catch(e){
    state.data = { lessons: [], qcm: [], cases: [] };
    render();
    alert("Erreur chargement module. Vérifie les chemins dans db_index.json et la présence des fichiers db/*.json");
  }
}

async function boot(){
  // Online badge
  window.addEventListener("online", ()=>{ state.online=true; render(); });
  window.addEventListener("offline", ()=>{ state.online=false; render(); });

  // SW register
  try{
    if ("serviceWorker" in navigator){
      await navigator.serviceWorker.register(bust(relUrl("sw.js")));
    }
  }catch(e){}

  // Load db_index.json
  try{
    const idxUrl = bust(relUrl("db_index.json"));
    const r = await fetch(idxUrl, { cache:"no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    state.modules = j.modules || [];
  }catch(e){
    state.modules = [];
  }

  render();
}

boot();