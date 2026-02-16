(() => {
  const VERSION = "2026-02-16";

  // --- Helpers
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const escapeHtml = (s) => (s ?? "").toString()
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  // Mini Markdown (suffisant pour cours)
  function md(text) {
    const t = (text ?? "").toString().replace(/\r\n/g, "\n");
    const lines = t.split("\n");
    let out = [];
    let inUl = false;

    const closeUl = () => { if (inUl) { out.push("</ul>"); inUl = false; } };

    for (let line of lines) {
      const l = line.trimEnd();

      // headings
      if (/^###\s+/.test(l)) { closeUl(); out.push(`<h3>${escapeHtml(l.replace(/^###\s+/, ""))}</h3>`); continue; }
      if (/^##\s+/.test(l))  { closeUl(); out.push(`<h2>${escapeHtml(l.replace(/^##\s+/, ""))}</h2>`); continue; }
      if (/^#\s+/.test(l))   { closeUl(); out.push(`<h2>${escapeHtml(l.replace(/^#\s+/, ""))}</h2>`); continue; }

      // bullet list
      if (/^\-\s+/.test(l)) {
        if (!inUl) { out.push("<ul>"); inUl = true; }
        out.push(`<li>${escapeHtml(l.replace(/^\-\s+/, ""))}</li>`);
        continue;
      }

      // empty line
      if (l.trim() === "") { closeUl(); out.push("<br>"); continue; }

      // paragraph
      closeUl();
      out.push(`<div>${escapeHtml(l)}</div>`);
    }
    closeUl();
    return out.join("\n");
  }

  // Base path safe for GitHub Pages subfolder (/fiscopilot/)
  function baseDir() {
    // example: /fiscopilot/ or /fiscopilot/index.html
    let p = location.pathname;
    if (!p.endsWith("/")) p = p.replace(/\/[^\/]*$/, "/");
    return location.origin + p;
  }
  const BASE = baseDir();

  async function fetchJson(url) {
    const u = url.includes("?") ? url : `${url}?v=${encodeURIComponent(VERSION)}`;
    const res = await fetch(u, { cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} sur ${url}\n${txt.slice(0, 120)}`);
    }
    return res.json();
  }

  // Merge TVA files if present
  async function loadTvaDb() {
    const candidates = [
      `${BASE}db/tva_3_expert.json`,
      `${BASE}db/tva_2_pratique.json`,
      `${BASE}db/tva_1_fondations.json`,
      `${BASE}db/tva.json`,
    ];

    let merged = { title: "TVA Belgique", courses: [], qcm: [], cases: [] };
    let any = false;

    for (const url of candidates) {
      try {
        const j = await fetchJson(url);
        any = true;
        merged.title = j.title || merged.title;

        // Support multiple schemas
        const courses = j.courses || j.cours || [];
        const qcm = j.qcm || j.qa || j.questions || [];
        const cases = j.cases || j.cas || [];

        merged.courses.push(...courses);
        merged.qcm.push(...qcm);
        merged.cases.push(...cases);
      } catch (e) {
        // ignore missing files
      }
    }

    if (!any) throw new Error("Aucun fichier TVA trouvé dans /db (tva*.json).");
    return normalizeDb(merged);
  }

  function normalizeDb(db) {
    const out = { ...db };

    out.courses = (out.courses || []).map((c, i) => ({
      id: c.id ?? `c${i+1}`,
      title: c.title || c.titre || `Cours ${i+1}`,
      level: c.level || c.niveau || "Intermédiaire",
      content: c.content || c.texte || c.body || ""
    }));

    out.qcm = (out.qcm || []).map((q, i) => {
      const options = q.options || q.choices || q.propositions || [];
      return {
        id: q.id ?? `q${i+1}`,
        question: q.question || q.q || `Question ${i+1}`,
        options: Array.isArray(options) ? options : [],
        answer: q.answer ?? q.correct ?? q.a ?? "",
        explanation: q.explanation || q.correction || q.explication || ""
      };
    });

    out.cases = (out.cases || []).map((c, i) => ({
      id: c.id ?? `k${i+1}`,
      question: c.question || c.q || `Cas ${i+1}`,
      answer: c.answer || c.a || c.correction || ""
    }));

    return out;
  }

  // --- UI / Navigation
  const routes = ["dashboard","modules","quiz","examen","profia","flashcards","stats","settings"];

  function setRoute(route) {
    if (!routes.includes(route)) route = "modules";
    $$(".page").forEach(p => p.classList.remove("active"));
    $(`#page-${route}`)?.classList.add("active");

    $$(".nav-item").forEach(a => a.classList.toggle("active", a.dataset.route === route));

    // Close drawer on route change (mobile friendly)
    closeDrawer();
  }

  function currentRoute() {
    const h = (location.hash || "#modules").replace("#","");
    return h || "modules";
  }

  // Drawer
  const drawer = $("#drawer");
  const overlay = $("#overlay");
  const menuBtn = $("#menuBtn");
  const closeDrawerBtn = $("#closeDrawerBtn");

  function openDrawer() {
    drawer.classList.add("open");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("show"));
    drawer.setAttribute("aria-hidden", "false");
    menuBtn?.setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("show");
    setTimeout(() => { overlay.hidden = true; }, 160);
    drawer.setAttribute("aria-hidden", "true");
    menuBtn?.setAttribute("aria-expanded", "false");
  }

  menuBtn?.addEventListener("click", () => {
    if (drawer.classList.contains("open")) closeDrawer(); else openDrawer();
  });
  closeDrawerBtn?.addEventListener("click", closeDrawer);
  overlay?.addEventListener("click", closeDrawer);

  // Network badge
  const netBadge = $("#netBadge");
  function refreshNetBadge() {
    if (!netBadge) return;
    const on = navigator.onLine;
    netBadge.textContent = on ? "En ligne" : "Hors ligne";
  }
  window.addEventListener("online", refreshNetBadge);
  window.addEventListener("offline", refreshNetBadge);
  refreshNetBadge();

  // Settings actions
  $("#btnHardReload")?.addEventListener("click", async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      // Bust caches
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {}
    location.reload(true);
  });

  $("#btnClearLocal")?.addEventListener("click", () => {
    localStorage.clear();
    sessionStorage.clear();
    alert("Données locales vidées ✅");
  });

  $("#settingsInfo").textContent = `Base: ${BASE}`;

  // --- Modules
  const modulesList = $("#modulesList");
  const moduleViewer = $("#moduleViewer");
  const syncStatus = $("#syncStatus");
  const btnRefreshDb = $("#btnRefreshDb");
  const kpiModules = $("#kpiModules");
  const kpiSync = $("#kpiSync");

  function setSyncLabel(txt, ok=true) {
    if (!syncStatus) return;
    syncStatus.textContent = txt;
    syncStatus.style.opacity = ok ? "1" : ".9";
  }

  // Minimal index (fallback) if db_index.json is missing
  async function loadDbIndex() {
    const url = `${BASE}db_index.json`;
    try {
      const idx = await fetchJson(url);
      return Array.isArray(idx) ? idx : (idx.modules || []);
    } catch {
      // fallback
      return [
        { id: "tva", title: "TVA Belgique", source: "db/tva.json" }
      ];
    }
  }

  function renderModules(mods) {
    if (!modulesList) return;
    modulesList.innerHTML = "";

    mods.forEach(m => {
      const div = document.createElement("div");
      div.className = "card clickable";
      div.innerHTML = `
        <div class="card-title">📚 ${escapeHtml(m.title || "Module")}</div>
        <div class="card-text muted">Appuie pour ouvrir</div>
      `;
      div.addEventListener("click", async () => {
        if ((m.id || "").toLowerCase() === "tva" || /tva/i.test(m.title || "")) {
          await openTvaModule();
        } else {
          alert("Module non branché pour l'instant.");
        }
      });
      modulesList.appendChild(div);
    });

    if (kpiModules) kpiModules.textContent = String(mods.length);
  }

  // --- TVA Module viewer (Cours / QCM / Cas)
  function pill(label) {
    return `<span class="pill">${escapeHtml(label)}</span>`;
  }

  function levelEmoji(level) {
    const l = (level||"").toLowerCase();
    if (l.includes("début")) return "🟢";
    if (l.includes("inter")) return "🟡";
    if (l.includes("avanc")) return "🟠";
    if (l.includes("expert")) return "🔴";
    return "🟡";
  }

  function pickRandom(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async function openTvaModule() {
    setRoute("modules");
    moduleViewer.hidden = false;
    moduleViewer.innerHTML = `<div class="muted">Chargement TVA…</div>`;

    try {
      const db = await loadTvaDb();
      setSyncLabel(`✅ TVA chargée`, true);

      const counts = `Cours: ${db.courses.length} • QCM: ${db.qcm.length} • Cas: ${db.cases.length}`;
      const source = `Sources: db/tva*.json`;

      // state
      let courseIndex = 0;
      let qcmSet = [];
      let qcmPos = 0;

      const render = () => {
        const c = db.courses[courseIndex] || db.courses[0];
        const cTitle = c ? `${courseIndex+1}/${db.courses.length} ${c.title}` : "Aucun cours";
        const cLevel = c ? `${levelEmoji(c.level)} ${c.level}` : "";

        moduleViewer.innerHTML = `
          <div class="module-head">
            <div>
              <div class="module-title">TVA Belgique</div>
              <div class="module-meta">${escapeHtml(counts)} • <span class="muted">${escapeHtml(source)}</span></div>
              <div class="pills">
                ${pill(`📚 ${db.courses.length} cours`)}
                ${pill(`🧪 ${db.qcm.length} QCM`)}
                ${pill(`🧾 ${db.cases.length} cas`)}
              </div>
            </div>
            <div class="row">
              <button class="btn subtle" id="btnBackModules">← Retour</button>
            </div>
          </div>

          <div class="card" style="margin-top:14px;">
            <div class="card-title">📚 Cours</div>
            <div class="row">
              <button class="btn" id="btnCourseRand">Cours aléatoire</button>
              <button class="btn" id="btnCoursePrev">◀ Précédent</button>
              <button class="btn primary" id="btnCourseNext">Suivant ▶</button>
            </div>

            <div class="list" id="courseList"></div>

            <div class="viewer-box" id="courseBox">
              <h2>${escapeHtml(cTitle)} <span class="small">${escapeHtml(cLevel)}</span></h2>
              <div>${md(c?.content || "Aucun contenu.")}</div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">🧪 QCM</div>
            <div class="row">
              <button class="btn" id="btnQcm5">Lancer 5 questions (aléatoire)</button>
              <button class="btn" id="btnQcm10">Lancer 10 questions (aléatoire)</button>
            </div>
            <div id="qcmBox" class="viewer-box"><div class="muted">Appuie sur “Lancer”.</div></div>
          </div>

          <div class="card">
            <div class="card-title">🧾 Cas pratiques</div>
            <div class="row">
              <button class="btn" id="btnCaseRand">Cas aléatoire</button>
            </div>
            <div id="caseBox" class="viewer-box"><div class="muted">Appuie sur “Cas aléatoire”.</div></div>
          </div>
        `;

        // course list (premium simple)
        const list = $("#courseList", moduleViewer);
        const maxShow = Math.min(10, db.courses.length);
        list.innerHTML = db.courses.slice(0, maxShow).map((x, i) => `
          <div class="item" data-i="${i}">
            <div class="item-title">${i+1}. ${escapeHtml(x.title)} <span class="muted">(${escapeHtml(x.level)})</span></div>
          </div>
        `).join("") + (db.courses.length > maxShow ? `<div class="muted">… +${db.courses.length - maxShow} autres cours (utilise Précédent/Suivant/Aléatoire)</div>` : "");

        $$(".item", list).forEach(el => {
          el.addEventListener("click", () => {
            const i = Number(el.getAttribute("data-i"));
            if (!Number.isNaN(i)) { courseIndex = i; render(); }
          });
        });

        // bind buttons
        $("#btnBackModules", moduleViewer).addEventListener("click", () => {
          moduleViewer.hidden = true;
          moduleViewer.innerHTML = "";
        });

        $("#btnCoursePrev", moduleViewer).addEventListener("click", () => {
          courseIndex = (courseIndex - 1 + db.courses.length) % db.courses.length;
          render();
        });
        $("#btnCourseNext", moduleViewer).addEventListener("click", () => {
          courseIndex = (courseIndex + 1) % db.courses.length;
          render();
        });
        $("#btnCourseRand", moduleViewer).addEventListener("click", () => {
          courseIndex = Math.floor(Math.random() * db.courses.length);
          render();
        });

        const qcmBox = $("#qcmBox", moduleViewer);
        const caseBox = $("#caseBox", moduleViewer);

        function renderQcmCurrent() {
          const q = qcmSet[qcmPos];
          if (!q) {
            qcmBox.innerHTML = `<div class="muted">Aucune question.</div>`;
            return;
          }
          const opts = (q.options || []).map((o, idx) => `
            <label class="item" style="display:flex; gap:10px; align-items:flex-start; cursor:pointer;">
              <input type="radio" name="q" value="${escapeHtml(o)}" style="margin-top:3px;">
              <div>
                <div class="item-title">${escapeHtml(o)}</div>
              </div>
            </label>
          `).join("");

          qcmBox.innerHTML = `
            <h2>${escapeHtml(`Question ${qcmPos+1}/${qcmSet.length}`)}</h2>
            <div style="margin-bottom:10px;">${escapeHtml(q.question)}</div>
            <div class="list">${opts || `<div class="muted">Pas d'options (à compléter dans le JSON).</div>`}</div>
            <div class="row" style="margin-top:10px;">
              <button class="btn" id="btnQPrev">◀</button>
              <button class="btn primary" id="btnQCheck">Voir correction</button>
              <button class="btn" id="btnQNext">▶</button>
            </div>
            <div id="qExplain" class="small muted" style="margin-top:8px;"></div>
          `;

          $("#btnQPrev", qcmBox).addEventListener("click", () => {
            qcmPos = (qcmPos - 1 + qcmSet.length) % qcmSet.length;
            renderQcmCurrent();
          });
          $("#btnQNext", qcmBox).addEventListener("click", () => {
            qcmPos = (qcmPos + 1) % qcmSet.length;
            renderQcmCurrent();
          });
          $("#btnQCheck", qcmBox).addEventListener("click", () => {
            const chosen = qcmBox.querySelector("input[name=q]:checked")?.value || "";
            const ok = chosen && (chosen === String(q.answer));
            const explain = $("#qExplain", qcmBox);
            explain.innerHTML = `
              <div>${ok ? "✅ Bonne réponse" : "❌ À corriger"}</div>
              <div><b>Réponse attendue :</b> ${escapeHtml(String(q.answer || "—"))}</div>
              ${q.explanation ? `<div style="margin-top:6px;">${md(q.explanation)}</div>` : ""}
            `;
          });
        }

        function startQcm(n) {
          const pool = [...db.qcm];
          // shuffle
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          qcmSet = pool.slice(0, Math.min(n, pool.length));
          qcmPos = 0;
          renderQcmCurrent();
        }

        $("#btnQcm5", moduleViewer).addEventListener("click", () => startQcm(5));
        $("#btnQcm10", moduleViewer).addEventListener("click", () => startQcm(10));

        $("#btnCaseRand", moduleViewer).addEventListener("click", () => {
          const caze = pickRandom(db.cases);
          if (!caze) { caseBox.innerHTML = `<div class="muted">Aucun cas.</div>`; return; }
          caseBox.innerHTML = `
            <h2>Cas pratique</h2>
            <div>${escapeHtml(caze.question)}</div>
            <div class="row" style="margin-top:10px;">
              <button class="btn primary" id="btnCaseShow">Voir correction</button>
              <button class="btn" id="btnCaseNext">Autre cas</button>
            </div>
            <div id="caseAns" class="small muted" style="margin-top:8px;"></div>
          `;
          $("#btnCaseShow", caseBox).addEventListener("click", () => {
            $("#caseAns", caseBox).innerHTML = md(caze.answer || "Correction à compléter.");
          });
          $("#btnCaseNext", caseBox).addEventListener("click", () => {
            $("#btnCaseRand", moduleViewer).click();
          });
        });
      };

      render();
    } catch (e) {
      console.error(e);
      setSyncLabel(`⚠️ Erreur TVA`, false);
      moduleViewer.hidden = false;
      moduleViewer.innerHTML = `
        <div class="card">
          <div class="card-title">Erreur chargement TVA</div>
          <div class="card-text muted">${escapeHtml(String(e.message || e))}</div>
          <div class="muted" style="margin-top:10px;">
            Chemin testé : ${escapeHtml(BASE)}db/tva*.json
          </div>
        </div>
      `;
    }
  }

  // Refresh DB / Sync (simple)
  async function initModules() {
    setSyncLabel("Chargement…", true);
    try {
      const mods = await loadDbIndex();
      renderModules(mods);
      const last = localStorage.getItem("last_sync") || "—";
      if (kpiSync) kpiSync.textContent = last;
      setSyncLabel("✅ Prêt", true);
    } catch (e) {
      console.error(e);
      setSyncLabel("⚠️ Sync impossible (offline ?) — mode local actif", false);
    }
  }

  btnRefreshDb?.addEventListener("click", async () => {
    setSyncLabel("Mise à jour…", true);
    await initModules();
    const now = new Date().toISOString().slice(0,10);
    localStorage.setItem("last_sync", now);
    if (kpiSync) kpiSync.textContent = now;
    setSyncLabel(`✅ Sync OK (${now})`, true);
  });

  // --- Router
  function onHashChange() { setRoute(currentRoute()); }
  window.addEventListener("hashchange", onHashChange);

  // --- Service worker register
  async function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");
      // optional
      console.log("SW ok", reg.scope);
    } catch (e) {
      console.log("SW fail", e);
    }
  }

  // Boot
  setRoute(currentRoute());
  initModules();
  registerSW();
})();