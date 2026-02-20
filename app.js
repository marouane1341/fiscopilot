(() => {
  "use strict";

  // ====== CONFIG ======
  const APP_BUILD = 101;

  const DB_INDEX = "db_index.json";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    dbIndex: null,
    moduleKey: null,
    module: null,      // { key, title, sources[] }
    pack: null,        // merged pack { lessons[], qcm[], cases[] }
    tab: "courses",    // courses | qcm | cases
    filter: "",
    modal: {
      open: false,
      kind: null,      // course | qcm | case
      items: [],
      idx: 0,
      speaking: false,
      paused: false,
      lastText: ""
    }
  };

  // ====== DOM ======
  const el = {
    app: $("#app"),
    buildNum: $("#buildNum"),
    netPill: $("#netPill"),

    drawer: $("#drawer"),
    btnMenu: $("#btnMenu"),
    btnClose: $("#btnClose"),
    navHome: $("#navHome"),
    navModules: $("#navModules"),
    navForceRefresh: $("#navForceRefresh"),

    modal: $("#modal"),
    modalBody: $("#modalBody"),
    modalClose: $("#modalClose"),
    modalMenu: $("#modalMenu"),
    modalLevel: $("#modalLevel"),
    modalPos: $("#modalPos"),
    prevBtn: $("#prevBtn"),
    nextBtn: $("#nextBtn"),
    resumeBtn: $("#resumeBtn"),

    toast: $("#toast"),
  };

  // ====== HELPERS ======
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    el.toast.setAttribute("aria-hidden", "false");
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => {
      el.toast.classList.remove("show");
      el.toast.setAttribute("aria-hidden", "true");
    }, 2400);
  }

  function setOnlineUI() {
    if (!el.netPill) return;
    const on = navigator.onLine;
    el.netPill.textContent = on ? "En ligne" : "Hors ligne";
    el.netPill.classList.toggle("online", on);
    el.netPill.classList.toggle("offline", !on);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeLevel(levelRaw) {
    const level = String(levelRaw ?? "").trim().toLowerCase();
    if (level.includes("début")) return { label: "Débutant", dot: "g" };
    if (level.includes("inter")) return { label: "Intermédiaire", dot: "a" };
    if (level.includes("avanc")) return { label: "Avancé", dot: "a" };
    if (level.includes("expert")) return { label: "Expert", dot: "r" };
    return { label: "Niveau", dot: "a" };
  }

  function firstPreviewFromText(text, max = 190) {
    const t = String(text ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) return "";
    return t.length > max ? t.slice(0, max).trim() + "…" : t;
  }

  async function fetchJson(url, noCache = false) {
    const res = await fetch(url, { cache: noCache ? "no-store" : "default" });
    if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
    return await res.json();
  }

  // Merge multiple packs into one
  function mergePacks(packs) {
    const merged = { meta: {}, lessons: [], qcm: [], cases: [] };
    for (const p of packs) {
      if (p?.meta) merged.meta = { ...merged.meta, ...p.meta };
      // lessons can be: lessons | courses | items
      const lessons = p?.lessons ?? p?.courses ?? p?.items ?? [];
      const qcm = p?.qcm ?? p?.mcq ?? p?.questions ?? [];
      const cases = p?.cases ?? p?.cas ?? [];
      merged.lessons.push(...lessons);
      merged.qcm.push(...qcm);
      merged.cases.push(...cases);
    }
    // cleanup lessons
    merged.lessons = merged.lessons
      .map((x, i) => ({
        id: x.id ?? `lesson_${i + 1}`,
        title: x.title ?? x.name ?? `Cours ${i + 1}`,
        level: String(x.level ?? x.niveau ?? "").trim(),
        text: x.text ?? x.content ?? x.body ?? ""
      }));

    merged.qcm = merged.qcm
      .map((q, i) => ({
        id: q.id ?? `qcm_${i + 1}`,
        level: String(q.level ?? "").trim(),
        question: q.question ?? q.q ?? `Question ${i + 1}`,
        choices: q.choices ?? q.options ?? [],
        answer: typeof q.answer === "number" ? q.answer : (typeof q.correct === "number" ? q.correct : -1),
        explain: q.explain ?? q.explanation ?? ""
      }));

    merged.cases = merged.cases
      .map((c, i) => ({
        id: c.id ?? `case_${i + 1}`,
        level: String(c.level ?? "").trim(),
        title: c.title ?? `Cas ${i + 1}`,
        question: c.question ?? "",
        answer_md: c.answer_md ?? c.answer ?? ""
      }));

    return merged;
  }

  // ====== AUDIO (Option 1: speechSynthesis) ======
  function ttsSupported() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  function stopSpeak() {
    try {
      if (!ttsSupported()) return;
      window.speechSynthesis.cancel();
    } catch {}
    state.modal.speaking = false;
    state.modal.paused = false;
    state.modal.lastText = "";
    updateResumeBtn();
  }

  function updateResumeBtn() {
    if (!el.resumeBtn) return;
    // show resume if paused
    el.resumeBtn.style.display = state.modal.paused ? "" : "none";
  }

  function pickFrenchVoice() {
    const voices = window.speechSynthesis.getVoices?.() || [];
    const fr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
    // Prefer fr-BE then fr-FR then anything fr
    return (
      fr.find(v => (v.lang || "").toLowerCase().includes("fr-be")) ||
      fr.find(v => (v.lang || "").toLowerCase().includes("fr-fr")) ||
      fr[0] ||
      null
    );
  }

  function speakText(text) {
    if (!ttsSupported()) {
      toast("Audio non supporté sur ce navigateur.");
      return;
    }

    const clean = String(text ?? "").replace(/\s+/g, " ").trim();
    if (!clean) {
      toast("Rien à lire.");
      return;
    }

    // stop previous
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;

    const voice = pickFrenchVoice();
    if (voice) utter.voice = voice;

    utter.onend = () => {
      state.modal.speaking = false;
      state.modal.paused = false;
      updateResumeBtn();
    };
    utter.onerror = () => {
      state.modal.speaking = false;
      state.modal.paused = false;
      updateResumeBtn();
      toast("Audio indisponible (voix non chargée / PWA).");
    };

    state.modal.speaking = true;
    state.modal.paused = false;
    state.modal.lastText = clean;
    updateResumeBtn();

    // voices can load async on some devices
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      toast("Audio bloqué par le navigateur.");
    }
  }

  function pauseSpeak() {
    if (!ttsSupported()) return;
    try {
      window.speechSynthesis.pause();
      state.modal.paused = true;
      updateResumeBtn();
    } catch {}
  }

  function resumeSpeak() {
    if (!ttsSupported()) return;
    try {
      window.speechSynthesis.resume();
      state.modal.paused = false;
      updateResumeBtn();
    } catch {}
  }

  // ====== UI: Drawer ======
  function openDrawer() {
    if (!el.drawer) return;
    el.drawer.classList.add("open");
    el.drawer.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    if (!el.drawer) return;
    el.drawer.classList.remove("open");
    el.drawer.setAttribute("aria-hidden", "true");
  }

  // ====== RENDER ======
  function renderDashboard() {
    const modules = state.dbIndex?.modules ?? [];
    el.app.innerHTML = `
      <div class="card">
        <div class="h1">Modules</div>
        <div class="small">Choisis un module. Les cours premium ont un objectif, une explication claire, des exemples et “à retenir”.</div>
      </div>

      <div class="list">
        ${modules.map(m => `
          <div class="item" data-open-module="${escapeHtml(m.key)}">
            <div class="itemTitle">📚 ${escapeHtml(m.title)}</div>
            <div class="preview">${escapeHtml(m.sources?.join(", ") || "")}</div>
            <div class="row space" style="margin-top:12px">
              <div class="badges">
                <span class="badge">📦 Sources: ${escapeHtml(String((m.sources||[]).length))}</span>
              </div>
              <button class="btn primary" data-open-module="${escapeHtml(m.key)}">Ouvrir</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderModule() {
    if (!state.module || !state.pack) {
      renderDashboard();
      return;
    }

    const lessons = state.pack.lessons ?? [];
    const qcm = state.pack.qcm ?? [];
    const cases = state.pack.cases ?? [];

    const counts = {
      courses: lessons.length,
      qcm: qcm.length,
      cases: cases.length
    };

    const tab = state.tab;
    const query = state.filter.trim().toLowerCase();

    const filterFn = (it) => {
      if (!query) return true;
      const s = `${it.title ?? ""} ${it.question ?? ""} ${it.text ?? ""}`.toLowerCase();
      return s.includes(query);
    };

    let list = [];
    if (tab === "courses") list = lessons.filter(filterFn);
    if (tab === "qcm") list = qcm.filter(filterFn);
    if (tab === "cases") list = cases.filter(filterFn);

    const listHtml = list.length ? list.map((it, idx) => {
      if (tab === "courses") {
        const lvl = normalizeLevel(it.level);
        return `
          <div class="item">
            <div class="itemTitle">${escapeHtml(it.title)}</div>
            <div class="itemMeta">
              <div class="badges">
                <span class="badge"><span class="dot ${lvl.dot}"></span>${escapeHtml(lvl.label)}</span>
                <span class="badge">📌 TVA Belgique</span>
                <span class="badge">📍 Cours premium</span>
              </div>
              <button class="btn" data-open-course="${escapeHtml(it.id)}">Ouvrir</button>
            </div>
            <div class="preview">${escapeHtml(firstPreviewFromText(it.text, 220))}</div>
          </div>
        `;
      }

      if (tab === "qcm") {
        const lvl = normalizeLevel(it.level);
        return `
          <div class="item">
            <div class="itemTitle">${escapeHtml(it.question)}</div>
            <div class="itemMeta">
              <div class="badges">
                <span class="badge"><span class="dot ${lvl.dot}"></span>${escapeHtml(lvl.label)}</span>
                <span class="badge">✍️ QCM</span>
              </div>
              <button class="btn" data-open-qcm="${escapeHtml(it.id)}">Ouvrir</button>
            </div>
            <div class="preview">${escapeHtml(firstPreviewFromText((it.explain || ""), 170))}</div>
          </div>
        `;
      }

      // cases
      const lvl = normalizeLevel(it.level);
      return `
        <div class="item">
          <div class="itemTitle">${escapeHtml(it.title)}</div>
          <div class="itemMeta">
            <div class="badges">
              <span class="badge"><span class="dot ${lvl.dot}"></span>${escapeHtml(lvl.label)}</span>
              <span class="badge">🧾 Cas</span>
            </div>
            <button class="btn" data-open-case="${escapeHtml(it.id)}">Ouvrir</button>
          </div>
          <div class="preview">${escapeHtml(firstPreviewFromText(it.question, 200))}</div>
        </div>
      `;
    }).join("") : `<div class="item"><div class="preview">Aucun résultat.</div></div>`;

    el.app.innerHTML = `
      <div class="card">
        <div class="row space">
          <div>
            <div class="h2">📘 ${escapeHtml(state.module.title)}</div>
            <div class="small">Cours: ${counts.courses} • QCM: ${counts.qcm} • Cas: ${counts.cases}</div>
            <div class="small">Sources: ${escapeHtml((state.module.sources || []).join(", "))}</div>
          </div>
          <button class="btn ghost" data-back>← Retour</button>
        </div>

        <div style="margin-top:14px" class="tabs">
          <button class="tab ${tab === "courses" ? "active" : ""}" data-tab="courses">📘 Cours</button>
          <button class="tab ${tab === "qcm" ? "active" : ""}" data-tab="qcm">✍️ QCM</button>
          <button class="tab ${tab === "cases" ? "active" : ""}" data-tab="cases">🧾 Cas</button>
        </div>

        <div class="searchRow">
          <input class="search" id="searchInput" placeholder="Rechercher (ex: prorata, facture, intracom)" value="${escapeHtml(state.filter)}" />
          <button class="btn primary" data-random>Aléatoire</button>
        </div>
      </div>

      <div class="list">
        ${listHtml}
      </div>
    `;

    const inp = $("#searchInput");
    if (inp) {
      inp.addEventListener("input", () => {
        state.filter = inp.value || "";
        renderModule();
      }, { passive: true });
    }
  }

  // ====== MODAL CONTENT BUILDERS ======
  function parseSectionsFromText(text) {
    // expected headings: OBJECTIF / EXPLICATION / MÉTHODE CABINET / EXEMPLE / À RETENIR / MINI-EXERCICE / CONTENU
    const raw = String(text ?? "").replace(/\r/g, "");
    const lines = raw.split("\n");
    const sections = [];
    let cur = { title: "CONTENU", body: [] };

    function pushCur() {
      const body = cur.body.join("\n").trim();
      if (body) sections.push({ title: cur.title, body });
    }

    const headerRe = /^(OBJECTIF|EXPLICATION|MÉTHODE CABINET|METHODE CABINET|EXEMPLE|À RETENIR|A RETENIR|MINI-EXERCICE|CONTENU)\s*:?$/i;

    for (const ln of lines) {
      const m = ln.trim().match(headerRe);
      if (m) {
        pushCur();
        cur = { title: m[1].toUpperCase().replace("METHODE", "MÉTHODE").replace("A RETENIR","À RETENIR"), body: [] };
      } else {
        cur.body.push(ln);
      }
    }
    pushCur();
    return sections.length ? sections : [{ title: "CONTENU", body: raw.trim() }];
  }

  function mdToHtmlSimple(s) {
    // minimal markdown-ish for answers: lines + bullets
    const t = String(s ?? "").trim();
    if (!t) return "";
    const esc = escapeHtml(t);
    const lines = esc.split("\n");

    // build paragraphs / lists
    let html = "";
    let inUl = false;

    for (const line of lines) {
      const l = line.trim();
      const isBullet = l.startsWith("- ") || l.startsWith("• ");
      if (isBullet) {
        if (!inUl) { html += "<ul>"; inUl = true; }
        html += `<li>${l.replace(/^(- |• )/, "")}</li>`;
      } else {
        if (inUl) { html += "</ul>"; inUl = false; }
        if (l) html += `<p>${l}</p>`;
      }
    }
    if (inUl) html += "</ul>";
    return html;
  }

  function setModalHeader(levelText, idx, total) {
    const lvl = normalizeLevel(levelText);
    if (el.modalLevel) el.modalLevel.textContent = lvl.label;
    if (el.modalPos) el.modalPos.textContent = `${idx + 1}/${total}`;
  }

  function openModal(kind, items, startIdx) {
    state.modal.open = true;
    state.modal.kind = kind;
    state.modal.items = items;
    state.modal.idx = startIdx;
    stopSpeak();

    if (el.modal) {
      el.modal.classList.add("open");
      el.modal.setAttribute("aria-hidden", "false");
    }
    renderModal();
  }

  function closeModal() {
    stopSpeak();
    state.modal.open = false;
    state.modal.kind = null;
    state.modal.items = [];
    state.modal.idx = 0;
    if (el.modal) {
      el.modal.classList.remove("open");
      el.modal.setAttribute("aria-hidden", "true");
    }
  }

  function renderModal() {
    if (!state.modal.open) return;

    const kind = state.modal.kind;
    const items = state.modal.items;
    const idx = state.modal.idx;
    const it = items[idx];
    if (!it) return;

    setModalHeader(it.level ?? "", idx, items.length);

    // top mini actions inside content
    const audioBtnHtml = `
      <div class="row" style="gap:10px; margin: 10px 0 14px;">
        <button class="btn ghost" id="ttsPlay">🔊 Lire</button>
        <button class="btn ghost" id="ttsPause">⏸ Pause</button>
        <button class="btn ghost" id="ttsStop">⏹ Stop</button>
      </div>
    `;

    if (kind === "course") {
      const sections = parseSectionsFromText(it.text);
      el.modalBody.innerHTML = `
        <div class="h2" style="margin:6px 0 10px;">${escapeHtml(it.title)}</div>
        <div class="row" style="gap:10px; margin-bottom: 10px;">
          <span class="badge"><span class="dot ${normalizeLevel(it.level).dot}"></span>${escapeHtml(normalizeLevel(it.level).label)}</span>
          <span class="badge">📌 TVA Belgique</span>
          <span class="badge">📍 Cours premium</span>
        </div>

        ${audioBtnHtml}

        ${sections.map(sec => `
          <div class="section">
            <h3>${escapeHtml(sec.title)}</h3>
            ${mdToHtmlSimple(sec.body)}
          </div>
        `).join("")}
      `;
    }

    if (kind === "qcm") {
      const choices = it.choices || [];
      el.modalBody.innerHTML = `
        <div class="h2" style="margin:6px 0 10px;">${escapeHtml(it.question)}</div>
        <div class="section">
          <h3>CHOISISSEZ</h3>
          <div class="choiceList" id="choiceList">
            ${choices.map((c, i) => `
              <button class="choice" data-choice="${i}">${escapeHtml(`${i + 1}) ${c}`)}</button>
            `).join("")}
          </div>
        </div>
        <div class="section">
          <h3>EXPLICATION</h3>
          <p>${escapeHtml(it.explain || "—")}</p>
        </div>
      `;
    }

    if (kind === "case") {
      el.modalBody.innerHTML = `
        <div class="h2" style="margin:6px 0 10px;">${escapeHtml(it.title)}</div>
        <div class="section">
          <h3>ÉNONCÉ</h3>
          ${mdToHtmlSimple(it.question)}
        </div>
        <div class="section">
          <h3>CORRECTION</h3>
          ${mdToHtmlSimple(it.answer_md || "—")}
        </div>
      `;
    }

    // bind modal buttons safely
    const ttsPlay = $("#ttsPlay", el.modalBody);
    const ttsPause = $("#ttsPause", el.modalBody);
    const ttsStop = $("#ttsStop", el.modalBody);

    if (ttsPlay) {
      ttsPlay.onclick = () => {
        // read the current lesson/qcm/case content in a human-friendly way
        let text = "";
        if (kind === "course") text = `${it.title}. ${String(it.text || "").replace(/\n+/g, " ")}`;
        if (kind === "qcm") text = `${it.question}. Choix: ${String((it.choices || []).join(". "))}. Explication: ${it.explain || ""}`;
        if (kind === "case") text = `${it.title}. Énoncé: ${it.question || ""}. Correction: ${it.answer_md || ""}`;
        speakText(text);
      };
    }
    if (ttsPause) ttsPause.onclick = () => pauseSpeak();
    if (ttsStop) ttsStop.onclick = () => stopSpeak();

    // QCM answer click
    const choiceList = $("#choiceList", el.modalBody);
    if (choiceList && kind === "qcm") {
      choiceList.onclick = (e) => {
        const btn = e.target.closest("[data-choice]");
        if (!btn) return;
        const picked = Number(btn.getAttribute("data-choice"));
        const correct = Number(it.answer);
        $$(".choice", choiceList).forEach(b => b.classList.remove("good","bad"));
        if (picked === correct) {
          btn.classList.add("good");
          toast("✅ Bonne réponse");
        } else {
          btn.classList.add("bad");
          const goodBtn = $(`.choice[data-choice="${correct}"]`, choiceList);
          if (goodBtn) goodBtn.classList.add("good");
          toast("❌ Mauvaise réponse");
        }
      };
    }

    // nav buttons state
    if (el.prevBtn) el.prevBtn.disabled = idx <= 0;
    if (el.nextBtn) el.nextBtn.disabled = idx >= items.length - 1;
    updateResumeBtn();
  }

  // ====== ACTIONS ======
  async function loadDbIndex(noCache = false) {
    state.dbIndex = await fetchJson(DB_INDEX, noCache);
  }

  async function openModuleByKey(key) {
    const mod = (state.dbIndex?.modules ?? []).find(m => m.key === key);
    if (!mod) {
      toast("Module introuvable.");
      return;
    }
    state.moduleKey = key;
    state.module = mod;

    // load all sources then merge
    const packs = [];
    for (const src of (mod.sources || [])) {
      try {
        const p = await fetchJson(src, false);
        packs.push(p);
      } catch (e) {
        console.error(e);
        toast(`Erreur chargement: ${src}`);
      }
    }
    state.pack = mergePacks(packs);

    // default tab
    state.tab = "courses";
    state.filter = "";
    renderModule();
  }

  function backToModules() {
    state.moduleKey = null;
    state.module = null;
    state.pack = null;
    state.tab = "courses";
    state.filter = "";
    renderDashboard();
  }

  function openRandom() {
    if (!state.pack) return;
    const tab = state.tab;
    let items = [];
    let kind = "course";
    if (tab === "courses") { items = state.pack.lessons; kind = "course"; }
    if (tab === "qcm") { items = state.pack.qcm; kind = "qcm"; }
    if (tab === "cases") { items = state.pack.cases; kind = "case"; }
    if (!items || !items.length) {
      toast("Aucun item dans cette section.");
      return;
    }
    const idx = Math.floor(Math.random() * items.length);
    openModal(kind, items, idx);
  }

  // ====== EVENTS (SAFE) ======
  function bindEvents() {
    // topbar / drawer
    if (el.btnMenu) el.btnMenu.onclick = () => openDrawer();
    if (el.btnClose) el.btnClose.onclick = () => closeDrawer();

    if (el.navHome) el.navHome.onclick = () => { closeDrawer(); backToModules(); };
    if (el.navModules) el.navModules.onclick = () => { closeDrawer(); backToModules(); };
    if (el.navForceRefresh) el.navForceRefresh.onclick = async () => {
      closeDrawer();
      toast("Refresh forcé…");
      // force reload index + bypass caches
      try {
        await loadDbIndex(true);
        backToModules();
        // also unregister SW cache visually: just reload
        location.reload();
      } catch (e) {
        console.error(e);
        toast("Impossible de forcer le refresh.");
      }
    };

    // click outside drawer closes
    document.addEventListener("click", (e) => {
      if (!el.drawer) return;
      if (!el.drawer.classList.contains("open")) return;
      const inside = e.target.closest(".drawer, #btnMenu");
      if (!inside) closeDrawer();
    }, { passive: true });

    // modal controls
    if (el.modalClose) el.modalClose.onclick = () => closeModal();
    if (el.modal) {
      el.modal.addEventListener("click", (e) => {
        if (e.target === el.modal) closeModal();
      });
    }

    if (el.prevBtn) el.prevBtn.onclick = () => {
      if (state.modal.idx > 0) {
        state.modal.idx -= 1;
        stopSpeak();
        renderModal();
      }
    };
    if (el.nextBtn) el.nextBtn.onclick = () => {
      if (state.modal.idx < state.modal.items.length - 1) {
        state.modal.idx += 1;
        stopSpeak();
        renderModal();
      }
    };
    if (el.resumeBtn) el.resumeBtn.onclick = () => resumeSpeak();

    // Modal menu = Sommaire rapide
    if (el.modalMenu) el.modalMenu.onclick = () => {
      if (!state.modal.items.length) return;
      toast("Sommaire : clique sur Précédent/Suivant (version 1).");
    };

    // Global app click delegation
    document.addEventListener("click", (e) => {
      const t = e.target;

      const openMod = t.closest("[data-open-module]");
      if (openMod) {
        const key = openMod.getAttribute("data-open-module");
        openModuleByKey(key);
        return;
      }

      const back = t.closest("[data-back]");
      if (back) {
        backToModules();
        return;
      }

      const tab = t.closest("[data-tab]");
      if (tab) {
        state.tab = tab.getAttribute("data-tab");
        renderModule();
        return;
      }

      const rnd = t.closest("[data-random]");
      if (rnd) {
        openRandom();
        return;
      }

      const openCourse = t.closest("[data-open-course]");
      if (openCourse && state.pack) {
        const id = openCourse.getAttribute("data-open-course");
        const idx = state.pack.lessons.findIndex(x => String(x.id) === String(id));
        if (idx >= 0) openModal("course", state.pack.lessons, idx);
        return;
      }

      const openQcm = t.closest("[data-open-qcm]");
      if (openQcm && state.pack) {
        const id = openQcm.getAttribute("data-open-qcm");
        const idx = state.pack.qcm.findIndex(x => String(x.id) === String(id));
        if (idx >= 0) openModal("qcm", state.pack.qcm, idx);
        return;
      }

      const openCase = t.closest("[data-open-case]");
      if (openCase && state.pack) {
        const id = openCase.getAttribute("data-open-case");
        const idx = state.pack.cases.findIndex(x => String(x.id) === String(id));
        if (idx >= 0) openModal("case", state.pack.cases, idx);
        return;
      }
    }, { passive: true });

    // online/offline
    window.addEventListener("online", setOnlineUI);
    window.addEventListener("offline", setOnlineUI);

    // voices can load async
    if (ttsSupported()) {
      window.speechSynthesis.onvoiceschanged = () => {
        // just to ensure voices are ready
      };
    }
  }

  // ====== INIT ======
  async function init() {
    if (el.buildNum) el.buildNum.textContent = String(APP_BUILD);
    setOnlineUI();
    bindEvents();

    // SW
    try {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("sw.js");
      }
    } catch (e) {
      console.warn("SW register failed", e);
    }

    try {
      await loadDbIndex(false);
      renderDashboard();

      // auto-open TVA module if exists (nice UX)
      const tva = (state.dbIndex?.modules ?? []).find(m => m.key === "tva_be");
      // (on ne force pas: on reste sur modules)
      if (!tva) {
        // nothing
      }
    } catch (e) {
      console.error(e);
      el.app.innerHTML = `
        <div class="item">
          <div class="itemTitle">Erreur</div>
          <div class="preview">${escapeHtml(String(e.message || e))}</div>
          <button class="btn primary" onclick="location.reload()">Recharger</button>
        </div>
      `;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();