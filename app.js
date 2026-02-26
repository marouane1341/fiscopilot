/* =========================
   FiscoPilot — app.js
   - Charge db/tva.json
   - Affiche Cours / QCM / Cas
   - Recherche + Aléatoire
   - Audio via Cloudflare Worker (POST {text})
   ========================= */

(() => {
  "use strict";

  // ✅ Mets l’URL de ton worker ici (IMPORTANT)
  // Exemple: "https://elevenapikey.marouane1341.workers.dev/"
  const AUDIO_WORKER_URL = "https://elevenapikey.marouane1341.workers.dev/";

  // DB
  const DB_URL = "db/tva.json";

  // State
  let DB = null;
  let mode = "lessons"; // lessons | qcm | cases
  let filtered = [];
  let idx = 0;

  // Audio state
  let lastAudioUrl = null;

  // Helpers
  const $ = (sel) => document.querySelector(sel);

  function escapeHTML(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function pickArray() {
    if (!DB) return [];
    if (mode === "lessons") return DB.lessons || [];
    if (mode === "qcm") return DB.qcm || [];
    if (mode === "cases") return DB.cases || [];
    return [];
  }

  function currentItem() {
    return filtered[idx] || null;
  }

  function setStatus(text) {
    const el = $("#status");
    if (el) el.textContent = text;
  }

  function setInfo(text) {
    const el = $("#info");
    if (el) el.textContent = text;
  }

  function updateCounts() {
    const el = $("#counts");
    if (!el || !DB) return;
    const c1 = (DB.lessons || []).length;
    const c2 = (DB.qcm || []).length;
    const c3 = (DB.cases || []).length;
    el.textContent = `Cours: ${c1} • QCM: ${c2} • Cas: ${c3}`;
  }

  function renderModuleTitle() {
    const el = $("#moduleTitle");
    const srcEl = $("#moduleSources");
    if (!DB) return;

    if (el) el.textContent = DB?.meta?.title || "TVA Belgique";
    if (srcEl) {
      // optionnel : si tu veux afficher “Sources: …”
      srcEl.textContent = `Sources: 1`;
    }
  }

  function renderItem() {
    const item = currentItem();
    const titleEl = $("#itemTitle");
    const levelEl = $("#itemLevel");
    const contentEl = $("#itemContent");

    if (!item) {
      if (titleEl) titleEl.textContent = "";
      if (levelEl) levelEl.textContent = "";
      if (contentEl) contentEl.innerHTML = "<em>Contenu…</em>";
      return;
    }

    if (mode === "lessons") {
      if (titleEl) titleEl.textContent = item.title || "";
      if (levelEl) levelEl.textContent = item.level || "";
      if (contentEl) contentEl.innerHTML = formatLesson(item.text || "");
      setInfo(`Cours ${idx + 1}/${filtered.length} • ID: ${item.id || ""}`);
      return;
    }

    if (mode === "qcm") {
      if (titleEl) titleEl.textContent = `QCM`;
      if (levelEl) levelEl.textContent = item.level || "";
      if (contentEl) contentEl.innerHTML = formatQCM(item, idx);
      setInfo(`QCM ${idx + 1}/${filtered.length}`);
      return;
    }

    if (mode === "cases") {
      if (titleEl) titleEl.textContent = item.title || "Cas";
      if (levelEl) levelEl.textContent = item.level || "";
      if (contentEl) contentEl.innerHTML = formatCase(item);
      setInfo(`Cas ${idx + 1}/${filtered.length}`);
      return;
    }
  }

  function formatLesson(text) {
    // format simple: titres en MAJ + sauts de ligne
    const lines = String(text || "").split("\n");
    let out = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) {
        out.push("<br/>");
        continue;
      }
      // si c’est un “titre” (OBJECTIF / EXPLICATION / etc.)
      if (/^[A-ZÉÈÀÙÂÊÎÔÛÇ0-9 \-()]+$/.test(t) && t.length <= 40) {
        out.push(`<h3>${escapeHTML(t)}</h3>`);
      } else {
        out.push(`<p>${escapeHTML(line)}</p>`);
      }
    }
    return out.join("\n");
  }

  function formatQCM(q, qIndex) {
    const question = escapeHTML(q.question || "");
    const choices = Array.isArray(q.choices) ? q.choices : [];
    const explain = escapeHTML(q.explain || "");
    const correct = Number(q.answer);

    const name = `qcm_${qIndex}`;
    let html = `<div class="qcm">
      <p><strong>${question}</strong></p>
      <div class="qcm-choices">`;

    choices.forEach((c, i) => {
      html += `
        <label class="qcm-choice">
          <input type="radio" name="${name}" value="${i}">
          ${escapeHTML(c)}
        </label>`;
    });

    html += `</div>
      <button id="btnCheckQCM" type="button">Vérifier</button>
      <div id="qcmResult" class="qcm-result" style="margin-top:10px;"></div>
    </div>`;

    // on ajoute un petit script inline (simple) pour gérer la vérif
    html += `
      <script>
        (function(){
          const btn = document.getElementById("btnCheckQCM");
          const res = document.getElementById("qcmResult");
          if(!btn || !res) return;
          btn.onclick = function(){
            const sel = document.querySelector('input[name="${name}"]:checked');
            if(!sel){ res.textContent = "Choisis une réponse."; return; }
            const v = Number(sel.value);
            if(v === ${correct}) {
              res.textContent = "✅ Correct. ${explain}";
            } else {
              res.textContent = "❌ Incorrect. ${explain}";
            }
          };
        })();
      </script>
    `;
    return html;
  }

  function formatCase(c) {
    const q = escapeHTML(c.question || "");
    const a = escapeHTML(c.answer_md || "");
    return `
      <div class="case">
        <p><strong>Question</strong></p>
        <p>${q}</p>
        <details style="margin-top:10px;">
          <summary>Voir la réponse</summary>
          <p style="margin-top:10px; white-space:pre-wrap;">${a}</p>
        </details>
      </div>
    `;
  }

  function applyFilter() {
    const all = pickArray();
    const q = normalize($("#search")?.value || "");

    if (!q) {
      filtered = all.slice();
    } else {
      filtered = all.filter((it) => {
        const blob =
          mode === "lessons"
            ? `${it.title || ""} ${it.text || ""} ${it.id || ""}`
            : mode === "qcm"
            ? `${it.question || ""} ${(it.choices || []).join(" ")} ${it.explain || ""}`
            : `${it.title || ""} ${it.question || ""} ${it.answer_md || ""}`;
        return normalize(blob).includes(q);
      });
    }

    idx = 0;
    renderItem();
  }

  function randomPick() {
    if (!filtered.length) return;
    idx = Math.floor(Math.random() * filtered.length);
    renderItem();
  }

  function next() {
    if (!filtered.length) return;
    idx = (idx + 1) % filtered.length;
    renderItem();
  }

  function prev() {
    if (!filtered.length) return;
    idx = (idx - 1 + filtered.length) % filtered.length;
    renderItem();
  }

  async function fetchAudio(text) {
    if (!AUDIO_WORKER_URL || !/^https?:\/\//.test(AUDIO_WORKER_URL)) {
      throw new Error("AUDIO_WORKER_URL manquant.");
    }

    // POST JSON {text}
    const r = await fetch(AUDIO_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    // si ton worker renvoie JSON erreur
    const ct = r.headers.get("content-type") || "";
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        if (ct.includes("application/json")) {
          const j = await r.json();
          msg = JSON.stringify(j);
        } else {
          msg = await r.text();
        }
      } catch {}
      throw new Error(msg);
    }

    // on attend un audio (mp3/ogg/wav)
    const buf = await r.arrayBuffer();
    if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);

    // content-type audio
    const mime = ct.includes("audio/") ? ct.split(";")[0] : "audio/mpeg";
    const blob = new Blob([buf], { type: mime });
    lastAudioUrl = URL.createObjectURL(blob);
    return { url: lastAudioUrl, mime, size: buf.byteLength };
  }

  async function playAudio() {
    const item = currentItem();
    if (!item) return;

    // texte à lire
    let text = "";
    if (mode === "lessons") text = item.text || item.title || "";
    if (mode === "qcm") text = `${item.question || ""}\n${(item.choices || []).map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
    if (mode === "cases") text = `${item.title || "Cas"}\n${item.question || ""}`;

    text = String(text || "").trim();
    if (!text) {
      setStatus("⚠️ Pas de texte à lire.");
      return;
    }

    const player = $("#player");
    if (!player) {
      setStatus("⚠️ Player audio introuvable (#player).");
      return;
    }

    setStatus("⏳ Génération audio…");
    try {
      const { url, size, mime } = await fetchAudio(text);
      player.src = url;

      // tenter autoplay (souvent bloqué, mais OK si clic utilisateur)
      try { await player.play(); } catch (_) {}

      setStatus(`✅ Audio reçu (${Math.round(size / 1024)} KB) • ${mime}`);
    } catch (err) {
      setStatus(`❌ Audio erreur: ${err?.message || String(err)}`);
    }
  }

  function setMode(newMode) {
    mode = newMode;
    applyFilter();
  }

  async function init() {
    setStatus("⏳ Chargement DB…");
    try {
      const r = await fetch(DB_URL, { cache: "no-store" });
      DB = await r.json();
      setStatus(`✅ DB chargée: "${DB?.meta?.title || "TVA"}" • v${DB?.meta?.version || "?"}`);
      renderModuleTitle();
      updateCounts();
      setMode("lessons");
    } catch (e) {
      setStatus("❌ Impossible de charger db/tva.json");
      console.error(e);
    }
  }

  function wireUI() {
    $("#btnLessons")?.addEventListener("click", () => setMode("lessons"));
    $("#btnQCM")?.addEventListener("click", () => setMode("qcm"));
    $("#btnCases")?.addEventListener("click", () => setMode("cases"));

    $("#btnRandom")?.addEventListener("click", randomPick);
    $("#btnPrev")?.addEventListener("click", prev);
    $("#btnNext")?.addEventListener("click", next);
    $("#btnAudio")?.addEventListener("click", playAudio);

    $("#search")?.addEventListener("input", applyFilter);

    $("#btnOpenFirst")?.addEventListener("click", () => {
      idx = 0;
      renderItem();
    });

    $("#btnBack")?.addEventListener("click", () => {
      // juste remonter en haut + reset
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireUI();
    init();
  });
})();