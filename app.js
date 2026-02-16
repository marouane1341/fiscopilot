async function loadModules() {
  try {
    const res = await fetch("db_index.json");
    const data = await res.json();

    const list = document.getElementById("modulesList");
    list.innerHTML = "";

    data.modules.forEach(m => {
      const div = document.createElement("div");
      div.style.marginBottom = "10px";
      div.style.padding = "10px";
      div.style.background = "#112a52";
      div.style.borderRadius = "8px";
      div.innerHTML = `<b>${m.title}</b>`;
      list.appendChild(div);
    });

  } catch (e) {
    console.log(e);
  }
}


async function syncNow() {
  const status = document.getElementById("syncStatus");
  status.innerHTML = "⏳ Synchronisation...";

  try {
    const res = await fetch("db_index.json");
    const data = await res.json();

    status.innerHTML = "✅ Sync OK (" + data.updated_at + ")";
    loadModules();

  } catch (e) {
    status.innerHTML = "⚠️ Sync impossible";
  }
}


function tutorAskOffline() {
  const q = document.getElementById("tutorQ").value.toLowerCase();
  const out = document.getElementById("tutorA");

  if (q.includes("tva")) {
    out.innerHTML = "La TVA est un impôt indirect sur la consommation.";
  } else {
    out.innerHTML = "Mode local : base minimale. On enrichit bientôt.";
  }
}


window.addEventListener("load", () => {
  loadModules();
});