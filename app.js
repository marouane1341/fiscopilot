const menuBtn = document.getElementById("menuBtn");
const sideMenu = document.getElementById("sideMenu");
const overlay = document.getElementById("overlay");

menuBtn.onclick = () => {
sideMenu.classList.toggle("open");
overlay.classList.toggle("show");
};

overlay.onclick = () => {
sideMenu.classList.remove("open");
overlay.classList.remove("show");
};

/* NAVIGATION */

function showPage(id){

document.querySelectorAll(".page").forEach(p=>{
p.classList.remove("active");
});

document.getElementById(id).classList.add("active");

sideMenu.classList.remove("open");
overlay.classList.remove("show");

}

/* TVA MODULE DEMO */

async function openTVA(){

const container = document.getElementById("moduleContent");

container.innerHTML = "Chargement...";

try{

const res = await fetch("db/tva.json");
const data = await res.json();

container.innerHTML = `
<div class="module-box">

<h2>TVA Belgique</h2>

📚 Cours: ${data.courses.length}<br>
🧪 QCM: ${data.qcm.length}<br>
📁 Cas: ${data.cases.length}

<br><br>

<button onclick="randomCourse()">Cours aléatoire</button>
<button onclick="randomQCM()">QCM</button>
<button onclick="randomCase()">Cas</button>

<div id="viewer" style="margin-top:15px;"></div>

</div>
`;

window.tvaData = data;

}catch(e){

container.innerHTML = "Erreur chargement TVA";

}

}

/* RANDOM */

function randomCourse(){

const c = tvaData.courses[
Math.floor(Math.random()*tvaData.courses.length)
];

document.getElementById("viewer").innerHTML =
`<h3>${c.title}</h3><p>${c.content}</p>`;

}

function randomQCM(){

const q = tvaData.qcm[
Math.floor(Math.random()*tvaData.qcm.length)
];

document.getElementById("viewer").innerHTML =
`<h3>${q.question}</h3>
<p>${q.options.join("<br>")}</p>
<p><b>Réponse :</b> ${q.answer}</p>`;

}

function randomCase(){

const c = tvaData.cases[
Math.floor(Math.random()*tvaData.cases.length)
];

document.getElementById("viewer").innerHTML =
`<h3>Cas</h3><p>${c.question}</p><p><b>Correction :</b> ${c.answer}</p>`;

}