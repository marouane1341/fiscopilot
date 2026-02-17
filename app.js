/* =====================================
   FiscoPilot AI ELITE MAX — Premium App
   Version clean compatible CSS V100
   ===================================== */

const APP_BUILD = 34;

const state = {
  modules: [],
  lessons: [],
  qcm: [],
  cases: [],
  currentLesson: 0
};

async function loadModules() {
  const res = await fetch("db_index.json", { cache: "no-store" });
  const data = await res.json();
  state.modules = data.modules || [];
  renderModules();
}

async function openModule(module) {
  let lessons = [];
  let qcm = [];
  let cases = [];

  for (const src of module.sources) {
    try {
      const res = await fetch(src + "?v=" + APP_BUILD, { cache: "no-store" });
      const data = await res.json();

      if (data.lessons) lessons.push(...data.lessons);
      if (data.qcm) qcm.push(...data.qcm);
      if (data.cases) cases.push(...data.cases);
    } catch (e) {
      console.error("Erreur chargement", src);
    }
  }

  state.lessons = lessons;
  state.qcm = qcm;
  state.cases = cases;
  state.currentLesson = 0;

  renderLessons();
}

function renderModules() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="fp-app">

      <div class="fp-topbar">
        <div class="fp-topbar-inner">
          <div class="brand">FiscoPilot AI ELITE MAX 🇧🇪</div>
          <div class="badge-online">
            <span class="dot"></span> En ligne
          </div>
        </div>
      </div>

      <div class="hero">
        <div class="h1">Modules</div>
        <div class="sub">Choisis un module de formation</div>
      </div>

      <div class="container">
        ${state.modules.map(m => `
          <div class="card">
            <div class="module-tile">
              <div class="module-left">
                <div class="module-icon">📚</div>
                <div>
                  <div class="card-title">${m.title}</div>
                  <div class="card-meta">
                    Sources : ${m.sources.join(", ")}
                  </div>
                </div>
              </div>

              <button class="btn-primary" onclick='openModule(${JSON.stringify(m)})'>
                Ouvrir
              </button>
            </div>
          </div>
        `).join("")}
      </div>

    </div>
  `;
}

function renderLessons() {
  const app = document.getElementById("app");

  app.innerHTML = `
    <div class="fp-app">

      <div class="fp-topbar">
        <div class="fp-topbar-inner">
          <button class="icon-btn" onclick="loadModules()">←</button>
          <div class="brand">TVA Belgique</div>
          <div></div>
        </div>
      </div>

      <div class="hero">
        <div class="h1">Cours</div>
        <div class="sub">${state.lessons.length} leçons disponibles</div>
      </div>

      <div class="container">

        <div class="list">
          ${state.lessons.map((l, i) => `
            <div class="lesson">
              <div>
                <h3>${i + 1}. ${l.title}</h3>
                <div class="pills">
                  <div class="pill blue">${l.level || "TVA"}</div>
                </div>
              </div>

              <button class="open" onclick="openLesson(${i})">
                Ouvrir
              </button>
            </div>
          `).join("")}
        </div>

      </div>

      <div id="lessonModal" class="modal">
        <div class="modal-sheet">
          <div class="modal-head">
            <button class="icon-btn" onclick="closeLesson()">✕</button>
            <div class="title" id="modalTitle"></div>
            <div></div>
          </div>

          <div class="modal-body" id="modalBody"></div>

          <div class="modal-foot">
            <button class="btn-ghost" onclick="prevLesson()">◀ Précédent</button>
            <button class="btn-primary" onclick="nextLesson()">Suivant ▶</button>
          </div>
        </div>
      </div>

    </div>
  `;
}

function openLesson(index) {
  state.currentLesson = index;
  const lesson = state.lessons[index];

  document.getElementById("modalTitle").innerText = lesson.title;

  document.getElementById("modalBody").innerHTML = `
    <div class="section">
      <h4>Contenu</h4>
      <div class="mono">${lesson.text || ""}</div>
    </div>
  `;

  document.getElementById("lessonModal").classList.add("show");
}

function closeLesson() {
  document.getElementById("lessonModal").classList.remove("show");
}

function nextLesson() {
  if (state.currentLesson < state.lessons.length - 1) {
    openLesson(state.currentLesson + 1);
  }
}

function prevLesson() {
  if (state.currentLesson > 0) {
    openLesson(state.currentLesson - 1);
  }
}

loadModules();
