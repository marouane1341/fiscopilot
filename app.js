const app = document.getElementById("app");

const courses = [
  {
    title: "TVA : logique, neutralité et mécanisme",
    content: `
La TVA est un impôt sur la consommation.

Entreprise = collecteur pour l'État.

TVA due = TVA ventes
TVA déductible = TVA achats

TVA à payer = différence.
`
  },
  {
    title: "Les 4 conditions TVA",
    content: `
1. Assujetti
2. Activité économique
3. Opération taxable
4. Lieu de taxation Belgique
`
  },
  {
    title: "Assujetti : qui est concerné",
    content: `
Toute personne exerçant une activité économique indépendante.

Exemples :
- indépendant
- société
- professions libérales
`
  }
];

let currentCourse = 0;

/* MENU */

const menuBtn = document.getElementById("menuBtn");
const sideMenu = document.getElementById("sideMenu");

menuBtn.onclick = () => {
  sideMenu.classList.toggle("open");
};

/* NAVIGATION */

function showPage(page) {

  sideMenu.classList.remove("open");

  if (page === "dashboard") renderDashboard();
  if (page === "modules") renderModules();
}

/* DASHBOARD */

function renderDashboard() {

  app.innerHTML = `
    <h2>Dashboard</h2>

    <div class="card">
      Bienvenue dans FiscoPilot AI ELITE MAX
    </div>
  `;
}

/* MODULE TVA */

function renderModules() {

  const c = courses[currentCourse];

  app.innerHTML = `
    <h2>Modules</h2>

    <div class="card">

      <h3>TVA Belgique</h3>

      <p><b>${c.title}</b></p>

      <p>${c.content}</p>

      <button class="button" onclick="randomCourse()">Aléatoire</button>
      <button class="button" onclick="prevCourse()">◀</button>
      <button class="button" onclick="nextCourse()">▶</button>

    </div>
  `;
}

/* NAVIGATION COURS */

function nextCourse() {
  currentCourse++;
  if (currentCourse >= courses.length) currentCourse = 0;
  renderModules();
}

function prevCourse() {
  currentCourse--;
  if (currentCourse < 0) currentCourse = courses.length - 1;
  renderModules();
}

function randomCourse() {
  currentCourse = Math.floor(Math.random() * courses.length);
  renderModules();
}

/* START */

renderDashboard();