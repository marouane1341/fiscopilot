/* app.js — Audio "section par section" (Samsung/Android friendly)
   - Vanilla JS
   - Ajoute une barre audio en bas
   - Découpe le texte en sections (OBJECTIF / EXPLICATION / etc.)
   - Lecture section par section avec Prev/Play/Next
*/

(() => {
  // ---------- Utils ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  function norm(s) {
    return (s || "")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  // Heuristique simple: une "section" commence souvent par un mot en majuscules + ":" ou un label seul.
  // Exemple: "OBJECTIF", "EXPLICATION", "À RETENIR", "MÉTHODE CABINET", "EXEMPLE", etc.
  const SECTION_TITLES = [
    "OBJECTIF",
    "EXPLICATION",
    "À RETENIR",
    "A RETENIR",
    "MÉTHODE",
    "METHODE",
    "MÉTHODE CABINET",
    "METHODE CABINET",
    "EXEMPLE",
    "EXERCICE",
    "PIÈGES",
    "PIEGES",
    "BON À SAVOIR",
    "BON A SAVOIR",
    "RÉSUMÉ",
    "RESUME",
    "NOTE",
  ];

  function looksLikeSectionHeader(line) {
    const l = norm(line);
    if (!l) return false;
    // "OBJECTIF" seul
    if (SECTION_TITLES.includes(l.toUpperCase())) return true;
    // "OBJECTIF: ..."
    const up = l.toUpperCase();
    if (SECTION_TITLES.some(t => up.startsWith(t + ":"))) return true;
    // "OBJECTIF - ..."
    if (SECTION_TITLES.some(t => up.startsWith(t + " -"))) return true;

    // Majuscules + ":" (ex: "EXPLICATION :")
    if (/^[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ' \-]{3,40}\s*:\s*/.test(l)) return true;

    return false;
  }

  function cleanHeader(line) {
    const l = norm(line);
    // enlève " : " ou " - "
    return l.replace(/\s*[:\-]\s*$/, "").trim();
  }

  // Découpe du texte en sections
  function splitIntoSections(rawText) {
    const text = norm(rawText);
    if (!text) return [];

    // on travaille ligne par ligne pour bien détecter les titres
    const lines = text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n");

    const sections = [];
    let current = { title: "Lecture", content: "" };

    const pushCurrent = () => {
      const c = norm(current.content);
      if (c) sections.push({ title: current.title, content: c });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Si la ligne ressemble à un header:
      if (looksLikeSectionHeader(line)) {
        // On pousse la section précédente
        pushCurrent();

        // Nouveau header
        const l = norm(line);
        let title = l;
        // Si "OBJECTIF: blabla" -> title=OBJECTIF, content += blabla
        const m = l.match(/^(.{2,40}?)[\s]*[:\-]\s*(.+)$/);
        if (m && looksLikeSectionHeader(m[1])) {
          title = cleanHeader(m[1]);
          current = { title, content: m[2] };
        } else {
          title = cleanHeader(l.replace(/\s*:\s*$/, ""));
          current = { title, content: "" };
        }
      } else {
        current.content += (current.content ? "\n" : "") + line;
      }
    }
    pushCurrent();

    // fallback si 1 seule section trop longue : on coupe en paragraphes
    if (sections.length === 1) {
      const paras = sections[0].content.split(/\n\s*\n/).map(norm).filter(Boolean);
      if (paras.length >= 2) {
        return paras.map((p, idx) => ({
          title: `Partie ${idx + 1}`,
          content: p
        }));
      }
    }

    return sections;
  }

  // ---------- Speech Engine ----------
  const Speech = {
    voices: [],
    voice: null,
    utterance: null,
    speaking: false,
    paused: false,

    loadVoices() {
      this.voices = window.speechSynthesis?.getVoices?.() || [];
      this.voice = pickBestFrenchVoice(this.voices);
      return this.voice;
    },

    async ensureVoicesReady(timeoutMs = 1500) {
      // Sur Android, les voix arrivent parfois en retard.
      const start = Date.now();
      this.loadVoices();
      if (this.voices.length) return;

      await new Promise((resolve) => {
        const onChange = () => {
          this.loadVoices();
          if (this.voices.length) {
            window.speechSynthesis.removeEventListener("voiceschanged", onChange);
            resolve();
          }
        };
        window.speechSynthesis.addEventListener("voiceschanged", onChange);

        const t = setInterval(() => {
          this.loadVoices();
          if (this.voices.length || Date.now() - start > timeoutMs) {
            clearInterval(t);
            window.speechSynthesis.removeEventListener("voiceschanged", onChange);
            resolve();
          }
        }, 120);
      });
    },

    stop() {
      try { window.speechSynthesis.cancel(); } catch (_) {}
      this.utterance = null;
      this.speaking = false;
      this.paused = false;
    },

    pause() {
      if (!this.speaking) return;
      try { window.speechSynthesis.pause(); } catch (_) {}
      this.paused = true;
    },

    resume() {
      if (!this.speaking) return;
      try { window.speechSynthesis.resume(); } catch (_) {}
      this.paused = false;
    },

    async speak(text, opts = {}) {
      const t = norm(text);
      if (!t) return;

      await this.ensureVoicesReady();

      // reset propre
      this.stop();

      const u = new SpeechSynthesisUtterance(t);
      this.utterance = u;

      // Voice selection
      this.voice = pickBestFrenchVoice(this.voices) || this.voice;
      if (this.voice) u.voice = this.voice;

      // Réglages "humains" (à ajuster si tu veux)
      u.lang = "fr-FR";
      u.rate = typeof opts.rate === "number" ? opts.rate : 1.0;  // 0.9-1.05 souvent bien
      u.pitch = typeof opts.pitch === "number" ? opts.pitch : 1.0;

      u.onstart = () => { this.speaking = true; this.paused = false; };
      u.onend = () => { this.speaking = false; this.paused = false; };
      u.onerror = () => { this.speaking = false; this.paused = false; };

      try {
        window.speechSynthesis.speak(u);
      } catch (_) {
        // parfois sur certains WebView, speak plante si pas de geste user:
        // mais comme on appelle via bouton, normalement OK.
        throw _;
      }
    }
  };

  function pickBestFrenchVoice(voices) {
    if (!voices || !voices.length) return null;

    // Priorité: voix fr-FR "naturelle" / "enhanced" / Samsung / Google
    const fr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
    if (!fr.length) return null;

    const score = (v) => {
      const name = (v.name || "").toLowerCase();
      const lang = (v.lang || "").toLowerCase();

      let s = 0;
      if (lang === "fr-fr") s += 10;
      if (name.includes("natural") || name.includes("neural") || name.includes("enhanced")) s += 8;

      // Samsung (si dispo)
      if (name.includes("samsung")) s += 7;

      // Google / Android
      if (name.includes("google")) s += 6;

      // Eviter certains “compact” trop robotiques
      if (name.includes("compact")) s -= 2;

      // stabilité
      if (v.localService) s += 1;
      if (v.default) s += 1;

      return s;
    };

    return [...fr].sort((a, b) => score(b) - score(a))[0] || fr[0];
  }

  // ---------- UI Audio (barre + logique sections) ----------
  const AudioUI = {
    sections: [],
    idx: 0,
    mounted: false,

    mount() {
      if (this.mounted) return;
      this.mounted = true;

      // Barre audio en bas
      const bar = document.createElement("div");
      bar.id = "audioBar";
      bar.style.position = "fixed";
      bar.style.left = "0";
      bar.style.right = "0";
      bar.style.bottom = "0";
      bar.style.zIndex = "9999";
      bar.style.padding = "10px";
      bar.style.backdropFilter = "blur(10px)";
      bar.style.background = "rgba(10, 20, 35, 0.75)";
      bar.style.borderTop = "1px solid rgba(255,255,255,0.12)";
      bar.style.display = "flex";
      bar.style.gap = "10px";
      bar.style.alignItems = "center";
      bar.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
      bar.style.color = "#fff";

      bar.innerHTML = `
        <button id="audPrev" style="flex:0 0 auto;padding:10px 12px;border-radius:12px;border:none;background:rgba(255,255,255,0.12);color:#fff;">◀</button>
        <button id="audPlay" style="flex:0 0 auto;padding:10px 14px;border-radius:12px;border:none;background:rgba(40,140,255,0.9);color:#fff;font-weight:700;">▶</button>
        <button id="audNext" style="flex:0 0 auto;padding:10px 12px;border-radius:12px;border:none;background:rgba(255,255,255,0.12);color:#fff;">▶▶</button>
        <div style="flex:1 1 auto;min-width:0;">
          <div id="audTitle" style="font-size:12px;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Audio</div>
          <div id="audSub" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</div>
        </div>
        <button id="audStop" style="flex:0 0 auto;padding:10px 12px;border-radius:12px;border:none;background:rgba(255,90,90,0.75);color:#fff;">■</button>
      `;
      document.body.appendChild(bar);

      $("#audPrev").addEventListener("click", () => this.prev());
      $("#audNext").addEventListener("click", () => this.next());
      $("#audStop").addEventListener("click", () => {
        Speech.stop();
        this.render();
      });

      $("#audPlay").addEventListener("click", async () => {
        if (!this.sections.length) return;

        // Toggle pause/resume si en cours
        if (Speech.speaking && !Speech.paused) {
          Speech.pause();
          this.render();
          return;
        }
        if (Speech.speaking && Speech.paused) {
          Speech.resume();
          this.render();
          return;
        }

        // sinon speak la section courante
        try {
          const s = this.sections[this.idx];
          await Speech.speak(`${s.title}. ${s.content}`, { rate: 1.0, pitch: 1.0 });
          // refresh UI pendant lecture (petit polling léger)
          this.render();
          const tick = setInterval(() => {
            this.render();
            if (!Speech.speaking) clearInterval(tick);
          }, 250);
        } catch (e) {
          // si blocage autoplay / erreur moteur
          console.warn("TTS error:", e);
          alert("Audio: impossible de lancer la voix (souvent restriction du navigateur). Réessaie en cliquant Play.");
        }
      });

      this.render();
    },

    setText(rawText, title = "Lecture") {
      this.sections = splitIntoSections(rawText);
      this.idx = 0;
      this.mount();
      $("#audTitle").textContent = title;
      this.render();
    },

    render() {
      const playBtn = $("#audPlay");
      const titleEl = $("#audTitle");
      const subEl = $("#audSub");

      if (!this.sections.length) {
        subEl.textContent = "Aucune section à lire";
        playBtn.textContent = "▶";
        return;
      }

      const s = this.sections[this.idx];
      titleEl.textContent = titleEl.textContent || "Audio";
      subEl.textContent = `${this.idx + 1}/${this.sections.length} • ${s.title}`;

      if (Speech.speaking && !Speech.paused) playBtn.textContent = "⏸";
      else if (Speech.speaking && Speech.paused) playBtn.textContent = "▶";
      else playBtn.textContent = "▶";
    },

    async next() {
      if (!this.sections.length) return;
      Speech.stop();
      this.idx = Math.min(this.idx + 1, this.sections.length - 1);
      this.render();
      // Option: auto-play next
      // await $("#audPlay").click();
    },

    async prev() {
      if (!this.sections.length) return;
      Speech.stop();
      this.idx = Math.max(this.idx - 1, 0);
      this.render();
      // Option: auto-play prev
      // await $("#audPlay").click();
    }
  };

  // ---------- Intégration à ton app ----------
  // IMPORTANT: il faut appeler AudioUI.setText(texte, titre) quand tu affiches un cours.
  // Comme je n'ai pas ton app.js original, je fournis 2 modes:
  //
  // Mode A (auto): si ta page affiche déjà le cours dans un élément #lessonContent
  // Mode B (manuel): tu appelles window.setAudioFromText(text, title)

  function tryAutoBind() {
    // Cherche une zone de contenu courante
    const el =
      $("#lessonContent") ||
      $("#content") ||
      $(".lesson-content") ||
      $("main");

    if (!el) return false;

    const txt = norm(el.innerText);
    if (txt.length < 40) return false;

    const title =
      norm($("h1")?.innerText) ||
      norm($("h2")?.innerText) ||
      "Cours";

    AudioUI.setText(txt, title);
    return true;
  }

  // Expose pour ton code existant
  window.setAudioFromText = (text, title) => AudioUI.setText(text, title);

  // Auto-bind au chargement + quand l’UI change (SPA)
  window.addEventListener("load", () => {
    tryAutoBind();

    // Observe les changements pour relancer quand tu ouvres un cours
    const obs = new MutationObserver(() => {
      // évite de spam: ne rebinde que si pas de sections
      if (!AudioUI.sections.length) tryAutoBind();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();