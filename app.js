// ---------- Utils ----------
const $ = (id) => document.getElementById(id);
const getJSON = (k, fb) => { try{ return JSON.parse(localStorage.getItem(k) || ""); } catch { return fb; } };
const setJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const clamp = (n,a,b) => Math.max(a, Math.min(b,n));
const todayKey = () => new Date().toISOString().slice(0,10);

function esc(s){ return String(s).replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }

// ---------- State ----------
let idx = null; // db_index
let currentModuleId = "pcmn";
let currentLessonId = null;

// Minimal local fallback (si pas encore de db/*)
const FALLBACK_DB = {
  lessons: [
    { id:"intro", title:"Introduction", text:"Base hors ligne. Ajoute tes db/*.json pour une base gigantesque.\n\nModules: PCMN, TVA, ISOC, IFRS, CSA, AML, Analyse." }
  ],
  qa: [
    { q:"tva", a:"TVA Belgique: 21% (standard), 12% et 6% (réduits), selon conditions." , tags:["tva"] },
    { q:"isoc", a:"ISOC: taux standard 25% (sous conditions pour taux réduits selon régime PME)." , tags:["isoc"] },
    { q:"pcmn", a:"PCMN: Plan Comptable Minimum Normalisé belge (structure en classes)." , tags:["pcmn"] },
    { q:"ifrs", a:"IFRS: normes comptables internationales (image fidèle, états financiers)." , tags:["ifrs"] },
    { q:"blanchiment", a:"AML/CTIF: obligations de vigilance, identification client, déclaration opérations suspectes." , tags:["aml"] }
  ],
  questions: [
    { id:"q1", q:"TVA standard en Belgique ?", o:["6%","12%","21%","0%"], a:2, exp:"Taux normal = 21%." , level:1, tags:["tva"] },
    { id:"q2", q:"PCMN signifie…", o:["Plan comptable","Impôt","TVA","Bilan"], a:0, exp:"PCMN = Plan Comptable Minimum Normalisé." , level:1, tags:["pcmn"] }
  ],
  flashcards: [
    { id:"f1", front:"TVA", back:"Taxe sur la valeur ajoutée (Belgique: 21/12/6%).", tags:["tva"] },
    { id:"f2", front:"ISOC", back:"Impôt des sociétés.", tags:["isoc"] },
    { id:"f3", front:"PCMN", back:"Plan Comptable Minimum Normalisé belge.", tags:["pcmn"] }
  ],
  oral: [
    { q:"Explique la différence entre charge et immobilisation.", a:"Charge: consommée sur l'exercice. Immobilisation: avantage économique sur plusieurs exercices (amortissable)." , tags:["pcmn"] },
    { q:"Que signifie 'assujetti TVA' ?", a:"Personne qui exerce une activité économique et qui est tenue aux obligations TVA (selon régime)." , tags:["tva"] }
  ]
};

// ---------- Storage keys ----------
const K = {
  idx:"db_index",
  mod:(id)=>"db_mod_"+id,
  token:"hf_token",
  stats:"stats",
  streak:"streak",
  examHist:"exam_history",
  leitner:"leitner" // { cardId: {box:1..5, due:timestamp} }
};

// ---------- Boot ----------
init();

async function init(){
  wireUI();
  await loadIndex();
  await __autoSyncWeekly?.();
  await refreshAfterSync();
  setView("dashboard");
  renderDashboard();
}

function wireUI(){
  $("btnMenu").onclick = () => $("sidebar").classList.toggle("open");

  document.querySelectorAll(".navitem").forEach(b=>{
    b.onclick = () => { setView(b.dataset.view); $("sidebar").classList.remove("open"); };
  });

  document.querySelectorAll("[data-goto]").forEach(b=>{
    b.onclick = () => setView(b.dataset.goto);
  });

  $("btnSyncNow").onclick = async () => { await __syncNow?.(); await refreshAfterSync(); renderDashboard(); };

  $("btnTutorAsk").onclick = () => tutorAskOffline();
  $("btnTutorBoost").onclick = () => tutorAskBoost();

  $("btnOralNext").onclick = () => oralNext();
  $("btnOralReveal").onclick = () => oralReveal();

  $("btnStartQuiz").onclick = () => startQuiz();
  $("btnStartExam").onclick = () => startExam();

  $("btnFcNext").onclick = () => flashNext();
  $("btnFcHard").onclick = () => flashGrade("hard");
  $("btnFcGood").onclick = () => flashGrade("good");
  $("btnFcEasy").onclick = () => flashGrade("easy");

  $("btnSaveToken").onclick = () => saveToken();
  $("btnClearToken").onclick = () => clearToken();
  $("btnReset").onclick = () => resetLocal();
}

function setView(name){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $("view-"+name).classList.add("active");
  document.querySelectorAll(".navitem").forEach(n=>n.classList.toggle("active", n.dataset.view===name));

  // render per view
  if(name==="modules") renderModules();
  if(name==="quiz") renderQuizSetup();
  if(name==="exam") renderExamSetup();
  if(name==="flashcards") renderFlashSetup();
  if(name==="stats") renderStats();
  if(name==="updates") renderUpdates();
  if(name==="settings") renderSettings();
  if(name==="dashboard") renderDashboard();
}

// ---------- Data loading ----------
async function loadIndex(){
  idx = getJSON(K.idx, null);
  if(!idx){
    // minimal index (si pas encore sync)
    idx = {
      updated_at: todayKey(),
      modules: [
        {id:"pcmn", title:"PCMN & Comptabilité belge", db_url:"db/pcmn.json"},
        {id:"tva", title:"TVA belge", db_url:"db/tva.json"},
        {id:"isoc", title:"ISOC", db_url:"db/isoc.json"},
        {id:"ifrs", title:"IFRS", db_url:"db/ifrs.json"},
        {id:"csa", title:"CSA", db_url:"db/csa.json"},
        {id:"aml", title:"Anti-blanchiment", db_url:"db/aml.json"},
        {id:"finance", title:"Analyse financière", db_url:"db/finance.json"}
      ],
      updates: [{date: todayKey(), title:"Base locale", summary:"Mode offline actif. Sync hebdo disponible."}]
    };
    setJSON(K.idx, idx);
  }
}

async function getModuleDB(id){
  const cached = getJSON(K.mod(id), null);
  if(cached) return cached;

  // try fetch local db file if exists
  try{
    const mod = idx.modules.find(m=>m.id===id);
    if(mod?.db_url){
      const res = await fetch(mod.db_url, { cache:"no-store" });
      if(res.ok){
        const data = await res.json();
        setJSON(K.mod(id), data);
        return data;
      }
    }
  }catch{}
  return FALLBACK_DB;
}

async function refreshAfterSync(){
  // refresh idx from localStorage
  idx = getJSON(K.idx, idx);
  // populate selects
  fillModuleSelects();
  // default module
  currentModuleId = idx.modules[0]?.id || "pcmn";
}

function fillModuleSelects(){
  const mods = idx.modules || [];
  const mk = (sel)=>{
    sel.innerHTML = mods.map(m=>`<option value="${esc(m.id)}">${esc(m.title)}</option>`).join("");
  };
  mk($("quizModule"));
  mk($("examModule"));
  mk($("fcModule"));
}

// ---------- Dashboard ----------
function getStats(){
  return getJSON(K.stats, {questions:0, quiz:0, exam:0, flash:0, weak:{}});
}
function setStats(s){ setJSON(K.stats, s); }

function bump(key, moduleId=null, val=1){
  const s = getStats();
  s[key] = (s[key]||0) + val;
  if(moduleId){
    s.weak[moduleId] = s.weak[moduleId] || {right:0, wrong:0};
  }
  setStats(s);
  updateStreak();
}

function updateStreak(){
  const today = todayKey();
  const st = getJSON(K.streak, {last:null, count:0});
  if(st.last === today) return;
  // if yesterday, +1 else reset to 1
  const y = new Date(); y.setDate(y.getDate()-1);
  const yKey = y.toISOString().slice(0,10);
  st.count = (st.last === yKey) ? (st.count+1) : 1;
  st.last = today;
  setJSON(K.streak, st);
}

function renderDashboard(){
  const s = getStats();
  const st = getJSON(K.streak, {count:0});
  const hist = getJSON(K.examHist, []);
  const last = hist[0] ? `${hist[0].score}/${hist[0].total}` : "—";

  $("dashProgress").textContent = `${Math.min(100, s.quiz*2 + s.exam*4 + s.flash)}%`;
  $("dashHint").textContent = `Base: ${idx.updated_at} • Activité: quiz ${s.quiz}, examens ${s.exam}, flashcards ${s.flash}`;
  $("dashStreak").textContent = st.count || 0;
  $("dashLastExam").textContent = last;

  const lastSync = Number(localStorage.getItem("db_last_sync")||"0");
  $("syncStatus").textContent = lastSync ? `Dernière sync: ${new Date(lastSync).toLocaleString()}` : "Pas encore synchronisé";
}

// ---------- Modules / lessons ----------
async function renderModules(){
  const mods = idx.modules || [];
  $("modulesList").innerHTML = mods.map(m=>`
    <div class="item">
      <div class="title">${esc(m.title)}</div>
      <div class="sub">${esc((m.tags||[]).slice(0,5).join(" • ") || "Cours • Quiz • Examen")}</div>
      <div class="row" style="margin-top:10px">
        <button class="btn2" onclick="selectModule('${esc(m.id)}')">Ouvrir</button>
      </div>
    </div>
  `).join("");

  await selectModule(currentModuleId);
}

window.selectModule = async function(id){
  currentModuleId = id;
  const db = await getModuleDB(id);

  // render first lesson
  const l = db.lessons?.[0];
  if(l){
    currentLessonId = l.id;
    $("lessonBox").textContent = `${l.title}\n\n${l.text}`;
  }else{
    $("lessonBox").textContent = "Aucune leçon trouvée dans ce module (ajoute db/*.json).";
  }
}

// ---------- Tutor (offline) ----------
async function tutorAskOffline(){
  const q = $("tutorQ").value.trim();
  if(!q){ $("tutorA").textContent = "Pose une question."; return; }

  const db = await getModuleDB(currentModuleId);
  const ans = buildTutorAnswerOffline(q, db);
  $("tutorA").innerHTML = ans;
  bump("questions", currentModuleId, 1);
}

function buildTutorAnswerOffline(question, db){
  const q = question.toLowerCase();
  // scoring simple (tags + contains)
  const candidates = (db.qa || FALLBACK_DB.qa).map(item=>{
    let score=0;
    const key = (item.q||"").toLowerCase();
    if(q.includes(key)) score += 5;
    (item.tags||[]).forEach(t=>{ if(q.includes(String(t).toLowerCase())) score += 2; });
    return {score, item};
  }).sort((a,b)=>b.score-a.score);

  const best = candidates[0]?.score ? candidates[0].item : null;

  if(!best){
    return `
<strong>Réponse (offline)</strong><br>
Je n’ai pas trouvé directement dans la base hors ligne.<br>
Essaie avec des mots clés (TVA, ISOC, PCMN, IFRS, CSA, AML, ratios…).<br><br>
<strong>Suggestion</strong><br>
- Reformule en 1 phrase courte<br>
- Ajoute le module (ex: "TVA: ...")`;
  }

  // Prof structuré
  const body = `
<strong>Réponse (offline)</strong><br>
${esc(best.a).replace(/\n/g,"<br>")}<br><br>
<strong>Pièges ITAA</strong><br>
- Vérifier conditions / exceptions<br>
- Ne pas confondre régime / taux / assiette<br><br>
<strong>Mini-quiz</strong><br>
1) Quel est le point clé ?<br>
2) Quelle exception possible ?<br>
3) Exemple concret en Belgique ?`;
  return body;
}

// ---------- Tutor Boost (online) ----------
async function tutorAskBoost(){
  const q = $("tutorQ").value.trim();
  if(!q){ $("tutorA").textContent = "Pose une question."; return; }

  // offline first
  const db = await getModuleDB(currentModuleId);
  const offline = buildTutorAnswerOffline(q, db);
  $("tutorA").innerHTML = offline + `<br><br><em class="muted">⏳ Boost en ligne…</em>`;

  const token = localStorage.getItem(K.token) || "";
  if(!navigator.onLine || !token){
    $("tutorA").innerHTML = offline + `<br><br><small class="muted">Boost indisponible (offline ou token manquant)</small>`;
    return;
  }

  // cache
  const cacheKey = "cache_boost_" + q.toLowerCase();
  const cached = localStorage.getItem(cacheKey);
  if(cached){
    $("tutorA").innerHTML = cached + `<br><br><small class="muted">⚡ cache</small>`;
    return;
  }

  try{
    const prompt = `
Tu es un professeur ITAA (Belgique). Réponds en FR.
Structure:
1) Définition
2) Règles clés (Belgique)
3) Exemple chiffré ou pratique
4) Pièges d'examen ITAA
5) 5 QCM (avec réponse A/B/C/D et explication)
Question: ${q}
`.trim();

    const res = await fetch("https://api-inference.huggingface.co/models/google/flan-t5-large", {
      method:"POST",
      headers:{
        "Authorization":"Bearer "+token,
        "Content-Type":"application/json"
      },
      body: JSON.stringify({ inputs: prompt })
    });

    const data = await res.json();
    if(data.error) throw new Error(data.error);

    const text = Array.isArray(data) ? (data[0]?.generated_text || "") : (data.generated_text || "");
    const formatted = `<strong>Réponse (boost)</strong><br>` + esc(text).replace(/\n/g,"<br>");

    localStorage.setItem(cacheKey, formatted);
    $("tutorA").innerHTML = formatted + `<br><br><small class="muted">🚀 boost</small>`;
    bump("questions", currentModuleId, 1);
  }catch(e){
    $("tutorA").innerHTML = offline + `<br><br><small class="muted">Boost échoué: ${esc(e.message||e)}</small>`;
  }
}

// ---------- Oral mode ----------
let oralCurrent = null;

async function oralNext(){
  const db = await getModuleDB(currentModuleId);
  const pool = db.oral || FALLBACK_DB.oral;
  oralCurrent = pool[Math.floor(Math.random()*pool.length)];
  $("oralQ").textContent = "Question: " + oralCurrent.q;
  $("oralA").textContent = "";
}

function oralReveal(){
  if(!oralCurrent){ $("oralA").textContent = "Clique d’abord sur 'Question du jury'."; return; }
  $("oralA").textContent = "Réponse attendue: " + oralCurrent.a;
}

// ---------- Quiz ----------
let quizState = null;

async function renderQuizSetup(){
  // nothing else for now
}

async function startQuiz(){
  const modId = $("quizModule").value;
  const mode = $("quizMode").value;
  const db = await getModuleDB(modId);

  const total = mode==="quick" ? 10 : 20;
  quizState = {
    modId,
    mode,
    total,
    i:0,
    score:0,
    pool: buildQuestionPool(db, modId),
    wrong:0
  };
  showQuizQuestion();
}

function buildQuestionPool(db, modId){
  const qs = (db.questions && db.questions.length) ? db.questions : FALLBACK_DB.questions;
  // filter by tags if possible
  const m = idx.modules.find(x=>x.id===modId);
  const tags = (m?.tags||[]).map(t=>String(t).toLowerCase());
  const filtered = qs.filter(q=>{
    const t = (q.tags||[]).map(x=>String(x).toLowerCase());
    return tags.length ? t.some(x=>tags.includes(x)) : true;
  });
  return filtered.length ? filtered : qs;
}

function pickQuestionAdaptive(state){
  // simple adapt: if wrong > right, pick easier; else pick mixed
  const pool = state.pool;
  // shuffle pick
  return pool[Math.floor(Math.random()*pool.length)];
}

function showQuizQuestion(){
  const s = quizState;
  if(!s){ $("quizBox").textContent="—"; return; }

  if(s.i >= s.total){
    $("quizBox").innerHTML = `<div class="big">Score: ${s.score}/${s.total}</div>
    <div class="muted">Résultat sauvegardé.</div>`;
    bump("quiz", s.modId, 1);
    return;
  }

  const q = pickQuestionAdaptive(s);
  s.current = q;

  $("quizBox").innerHTML = `
    <div class="qtitle">(${s.i+1}/${s.total}) ${esc(q.q)}</div>
    ${q.o.map((opt,idx)=>`<button class="opt" onclick="answerQuiz(${idx})">${esc(opt)}</button>`).join("")}
    <div class="muted" style="margin-top:10px">Mode: ${esc(s.mode)} • Module: ${esc(s.modId)}</div>
  `;
}

window.answerQuiz = function(choice){
  const s = quizState;
  const q = s.current;
  const correct = choice === q.a;

  // update module weakness
  const stats = getStats();
  stats.weak[s.modId] = stats.weak[s.modId] || {right:0, wrong:0};
  if(correct){ s.score++; stats.weak[s.modId].right++; }
  else { s.wrong++; stats.weak[s.modId].wrong++; }
  setStats(stats);

  // show feedback then next
  const opts = document.querySelectorAll("#quizBox .opt");
  opts.forEach((b,i)=>{
    if(i===q.a) b.classList.add("correct");
    if(i===choice && !correct) b.classList.add("wrong");
    b.disabled = true;
  });

  const exp = q.exp ? `<div class="answer"><strong>Explication:</strong> ${esc(q.exp)}</div>` : "";
  $("quizBox").insertAdjacentHTML("beforeend", exp + `<div class="row"><button class="btn" onclick="nextQuiz()">Suivant</button></div>`);
}

window.nextQuiz = function(){
  quizState.i++;
  showQuizQuestion();
}

// ---------- Exam ----------
let examState = null;
let examInterval = null;

async function renderExamSetup(){
  // nothing
}

async function startExam(){
  const modId = $("examModule").value;
  const minutes = Number($("examDuration").value || "60");
  const db = await getModuleDB(modId);

  examState = {
    modId,
    total: 50,
    i:0,
    score:0,
    pool: buildQuestionPool(db, modId),
    endAt: Date.now() + minutes*60*1000,
    current: null
  };

  $("examScore").textContent = "";
  tickExamTimer();
  clearInterval(examInterval);
  examInterval = setInterval(tickExamTimer, 1000);

  showExamQuestion();
}

function tickExamTimer(){
  if(!examState){ $("examTimer").textContent="—"; return; }
  const ms = examState.endAt - Date.now();
  if(ms <= 0){
    finishExam();
    return;
  }
  const m = Math.floor(ms/60000);
  const s = Math.floor((ms%60000)/1000);
  $("examTimer").textContent = `${m}m ${s}s`;
}

function showExamQuestion(){
  const s = examState;
  if(!s) return;

  if(s.i >= s.total){
    finishExam();
    return;
  }

  const q = s.pool[Math.floor(Math.random()*s.pool.length)];
  s.current = q;

  $("examBox").innerHTML = `
    <div class="qtitle">(${s.i+1}/${s.total}) ${esc(q.q)}</div>
    ${q.o.map((opt,idx)=>`<button class="opt" onclick="answerExam(${idx})">${esc(opt)}</button>`).join("")}
  `;
}

window.answerExam = function(choice){
  const s = examState;
  const q = s.current;
  const correct = choice === q.a;
  if(correct) s.score++;

  // lock options
  const opts = document.querySelectorAll("#examBox .opt");
  opts.forEach((b,i)=>{
    if(i===q.a) b.classList.add("correct");
    if(i===choice && !correct) b.classList.add("wrong");
    b.disabled = true;
  });

  const exp = q.exp ? `<div class="answer"><strong>Explication:</strong> ${esc(q.exp)}</div>` : "";
  $("examBox").insertAdjacentHTML("beforeend", exp + `<div class="row"><button class="btn" onclick="nextExam()">Suivant</button></div>`);
}

window.nextExam = function(){
  examState.i++;
  showExamQuestion();
}

function finishExam(){
  if(!examState) return;
  clearInterval(examInterval);

  const score = examState.score;
  const total = examState.total;
  $("examScore").textContent = `Score final: ${score}/${total}`;

  // store history
  const hist = getJSON(K.examHist, []);
  hist.unshift({ at: Date.now(), module: examState.modId, score, total });
  setJSON(K.examHist, hist.slice(0, 20));

  bump("exam", examState.modId, 1);
  examState = null;
}

// ---------- Flashcards (Leitner) ----------
let fcState = { card:null, modId:null };

async function renderFlashSetup(){
  // show first
  await flashNext();
}

function getLeitner(){
  return getJSON(K.leitner, {}); // {id:{box, due}}
}
function setLeitner(v){ setJSON(K.leitner, v); }

async function flashNext(){
  const modId = $("fcModule").value || currentModuleId;
  fcState.modId = modId;

  const db = await getModuleDB(modId);
  const cards = (db.flashcards && db.flashcards.length) ? db.flashcards : FALLBACK_DB.flashcards;
  const leit = getLeitner();
  const now = Date.now();

  // due cards first; else random
  const due = cards.filter(c=>{
    const st = leit[c.id];
    return !st || (st.due||0) <= now;
  });

  const pickFrom = due.length ? due : cards;
  const card = pickFrom[Math.floor(Math.random()*pickFrom.length)];
  fcState.card = card;

  $("fcCard").innerHTML = `<strong>${esc(card.front || card.q || "Carte")}</strong>\n\n${esc(card.back || card.a || "")}`;
  const st = leit[card.id] || {box:1, due:0};
  $("fcMeta").textContent = `Boîte: ${st.box} • ${due.length? "à réviser" : "toutes révisées (random)"}`;
}

function scheduleNext(box, grade){
  // Leitner spacing
  const days = [0, 1, 3, 7, 14, 30]; // index box
  const mult = (grade==="easy") ? 1 : (grade==="good" ? 0.8 : 0.4);
  const d = Math.max(0.1, days[box] * mult);
  return Date.now() + d*24*60*60*1000;
}

function flashGrade(grade){
  const card = fcState.card;
  if(!card){ return; }

  const leit = getLeitner();
  const st = leit[card.id] || {box:1, due:0};

  if(grade==="hard") st.box = clamp(st.box - 1, 1, 5);
  if(grade==="good") st.box = st.box; // keep
  if(grade==="easy") st.box = clamp(st.box + 1, 1, 5);

  st.due = scheduleNext(st.box, grade);
  leit[card.id] = st;
  setLeitner(leit);

  bump("flash", fcState.modId, 1);
  flashNext();
}

// ---------- Stats ----------
function renderStats(){
  const s = getStats();
  const hist = getJSON(K.examHist, []);
  const last5 = hist.slice(0,5).map(h=>`• ${new Date(h.at).toLocaleString()} — ${h.module}: ${h.score}/${h.total}`).join("\n") || "Aucun examen enregistré.";

  $("statsScores").textContent = `Quiz: ${s.quiz}\nExamens: ${s.exam}\nFlashcards: ${s.flash}\n\nDerniers examens:\n${last5}`;

  // weaknesses
  const entries = Object.entries(s.weak || {}).map(([mid, v])=>{
    const total = (v.right||0)+(v.wrong||0);
    const rate = total ? Math.round(100*(v.right||0)/total) : 0;
    return {mid, total, rate};
  }).sort((a,b)=>a.rate-b.rate);

  const weak = entries.slice(0,4).map(x=>`• ${x.mid}: ${x.rate}% (n=${x.total})`).join("\n") || "Pas assez de données.";
  $("statsWeak").textContent = `Faiblesses (taux de réussite bas):\n${weak}\n\nConseil: fais un quiz “adaptatif” sur ces modules.`;
}

// ---------- Updates ----------
function renderUpdates(){
  const u = (idx.updates || []).slice().reverse();
  $("updatesList").innerHTML = u.map(x=>`
    <div class="item">
      <div class="title">${esc(x.title)} <span class="muted">(${esc(x.date)})</span></div>
      <div class="sub">${esc(x.summary || "")}</div>
    </div>
  `).join("") || `<div class="muted">Aucune actu.</div>`;
}

// ---------- Settings ----------
function renderSettings(){
  const t = localStorage.getItem(K.token) || "";
  $("hfToken").value = t;
  $("tokenStatus").textContent = t ? "✅ Token présent sur cet appareil" : "Aucun token (boost désactivé).";
}

function saveToken(){
  const t = $("hfToken").value.trim();
  if(!t || !t.startsWith("hf_")){
    $("tokenStatus").textContent = "Token invalide (doit commencer par hf_)";
    return;
  }
  localStorage.setItem(K.token, t);
  $("tokenStatus").textContent = "✅ Token enregistré localement.";
}
function clearToken(){
  localStorage.removeItem(K.token);
  $("hfToken").value = "";
  $("tokenStatus").textContent = "Token supprimé.";
}

function resetLocal(){
  if(!confirm("Effacer données locales (stats, historique, leitner, cache) ?")) return;
  const keepIdx = localStorage.getItem(K.idx);
  localStorage.clear();
  if(keepIdx) localStorage.setItem(K.idx, keepIdx);
  location.reload();
}