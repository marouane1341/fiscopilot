// ===== Utils =====
async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(path + " -> HTTP " + res.status);
  return await res.json();
}

// ===== Modules =====
async function loadModules() {
  const list = document.getElementById("modulesList");
  if (!list) return;

  list.innerHTML = "⏳ Chargement des modules...";

  try {
    const idx = await fetchJSON("db_index.json");
    list.innerHTML = "";

    (idx.modules || []).forEach(m => {
      // ✅ bouton (onclick) = ultra fiable sur mobile
      const btn = document.createElement("button");
      btn.className = "navitem";
      btn.style.cursor = "pointer";
      btn.innerHTML = `📚 <b>${m.title}</b><div style="opacity:.7;font-size:13px;margin-top:4px;">Appuie pour ouvrir</div>`;
      btn.onclick = () => openModule(m.db_url, m.title);
      list.appendChild(btn);
    });

    if (!(idx.modules || []).length) {
      list.innerHTML = "Aucun module dans db_index.json";
    }
  } catch (e) {
    list.innerHTML = "❌ Erreur loadModules: " + e.message;
  }
}

async function openModule(dbUrl, title) {
  const list = document.getElementById("modulesList");
  if (!list) return;

  // ✅ preuve immédiate que le clic est bien pris
  list.innerHTML = `✅ Clic détecté — ouverture: <b>${title}</b>...`;

  try {
    const data = await fetchJSON(dbUrl);

    const lessons = data.lessons || [];
    const questions = data.questions || [];
    const cases = data.cases || [];

    list.innerHTML = `
      <div style="padding:12px;background:#0d1f3c;border-radius:10px;">
        <div style="font-size:18px;font-weight:800;margin-bottom:8px;">${title}</div>
        <div style="opacity:.75;margin-bottom:10px;">Source: <code>${dbUrl}</code></div>

        <div style="margin-bottom:10px;">
          <b>📚 Cours:</b> ${lessons.length}<br/>
          <b>🧪 QCM:</b> ${questions.length}<br/>
          <b>🧾 Cas:</b> ${cases.length}
        </div>

        <button class="btn" onclick="showFirstLesson()">Ouvrir 1er cours</button>
        <button class="btn" style="margin-left:8px;" onclick="startOneQuestion()">1 Question</button>
        <button class="btn" style="margin-left:8px;" onclick="showOneCase()">1 Cas</button>

        <div id="moduleBox" style="margin-top:12px; background:#112a52; padding:12px; border-radius:10px;"></div>

        <button class="btn" style="margin-top:12px;" onclick="loadModules()">⬅ Retour</button>
      </div>
    `;

    // garder le module en mémoire
    window.__MODULE_DATA__ = data;

  } catch (e) {
    list.innerHTML = "❌ Erreur openModule: " + e.message;
  }
}

// ===== Actions module =====
function showFirstLesson() {
  const box = document.getElementById("moduleBox");
  const data = window.__MODULE_DATA__ || {};
  const lessons = data.lessons || [];
  if (!lessons.length) { box.innerHTML = "Aucun cours."; return; }
  const l = lessons[0];
  box.innerHTML = `<b>${l.title}</b><br/><br/>${escapeHtml(l.text).replace(/\n/g, "<br/>")}`;
}

function startOneQuestion() {
  const box = document.getElementById("moduleBox");
  const data = window.__MODULE_DATA__ || {};
  const qs = data.questions || [];
  if (!qs.length) { box.innerHTML = "Aucune question."; return; }
  const q = qs[Math.floor(Math.random() * qs.length)];

  box.innerHTML = `
    <b>${q.q}</b><br/><br/>
    ${q.o.map((opt, i)=> `<button class="navitem" style="margin:6px 0;" onclick="answerOne(${i})">${opt}</button>`).join("")}
    <div id="oneFb" style="margin-top:10px; opacity:.9"></div>
  `;
  window.__ONE_Q__ = q;
}

function answerOne(i) {
  const fb = document.getElementById("oneFb");
  const q = window.__ONE_Q__;
  if (!q) return;
  fb.innerHTML = (i === q.a)
    ? "✅ Correct"
    : `❌ Faux — Réponse: <b>${q.o[q.a]}</b><br/><small>${q.exp || ""}</small>`;
}

function showOneCase() {
  const box = document.getElementById("moduleBox");
  const data = window.__MODULE_DATA__ || {};
  const cs = data.cases || [];
  if (!cs.length) { box.innerHTML = "Aucun cas."; return; }
  const c = cs[Math.floor(Math.random() * cs.length)];
  box.innerHTML = `
    <b>Question:</b><br/>${escapeHtml(c.q)}<br/><br/>
    <button class="btn" onclick="document.getElementById('caseA').style.display='block'">Voir correction</button>
    <div id="caseA" style="display:none; margin-top:10px;"><b>Correction:</b><br/>${escapeHtml(c.a)}</div>
  `;
}

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ===== Sync =====
async function syncNow() {
  const status = document.getElementById("syncStatus");
  if (status) status.innerHTML = "⏳ Synchronisation...";

  try {
    const idx = await fetchJSON("db_index.json");
    if (status) status.innerHTML = "✅ Sync OK (" + (idx.updated_at || "ok") + ")";
    await loadModules();
  } catch (e) {
    if (status) status.innerHTML = "⚠️ Sync impossible — " + e.message;
  }
}

// ===== Tutor minimal =====
function tutorAskOffline() {
  const q = (document.getElementById("tutorQ").value || "").toLowerCase();
  const out = document.getElementById("tutorA");
  if (!q) { out.innerHTML = "Pose une question."; return; }
  if (q.includes("tva")) out.innerHTML = "TVA: impôt indirect. Déduction si achat pro + facture conforme + activité taxable (limites véhicules...).";
  else out.innerHTML = "Mode local: on enrichit la base progressivement.";
}

// auto
window.addEventListener("load", loadModules);