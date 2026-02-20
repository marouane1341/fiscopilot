/* ================================
   FiscoPilot APP SAFE v37
   ================================ */

const APP_BUILD = 37;

/* ------------------------------
   Helpers
------------------------------ */

function $(id) {
  return document.getElementById(id);
}

function safeClick(id, fn) {
  const el = $(id);
  if (!el) return;
  el.onclick = fn;
}

/* ------------------------------
   Service Worker
------------------------------ */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

/* ------------------------------
   Drawer
------------------------------ */

function openDrawer() {
  const d = $("drawer");
  if (!d) return;
  d.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  const d = $("drawer");
  if (!d) return;
  d.setAttribute("aria-hidden", "true");
}

/* ------------------------------
   Modal
------------------------------ */

function openModal() {
  const m = $("modal");
  if (!m) return;
  m.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const m = $("modal");
  if (!m) return;
  m.setAttribute("aria-hidden", "true");
}

/* ------------------------------
   Force refresh killer
------------------------------ */

async function killAllCachesAndSW() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }

    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {}
}

/* ------------------------------
   Fake content loader (safe)
------------------------------ */

function loadHome() {
  const app = $("app");
  if (!app) return;

  app.innerHTML = `
    <div class="card">
      <h2>Modules</h2>
      <p>Choisis un module.</p>
      <button class="btn primary" id="demoOpen">Ouvrir démo</button>
    </div>
  `;

  safeClick("demoOpen", openModal);
}

/* ------------------------------
   Init
------------------------------ */

function initApp() {

  // Drawer
  safeClick("btnMenu", openDrawer);
  safeClick("btnClose", closeDrawer);
  safeClick("modalMenu", openDrawer);

  // Modal
  safeClick("modalClose", closeModal);
  safeClick("prevBtn", () => console.log("prev"));
  safeClick("nextBtn", () => console.log("next"));

  // Force refresh
  safeClick("navForceRefresh", async () => {
    await killAllCachesAndSW();
    location.reload(true);
  });

  // Modules nav
  safeClick("navModules", loadHome);

  // Online indicator
  const pill = $("netPill");

  function updateNet() {
    if (!pill) return;

    if (navigator.onLine) {
      pill.textContent = "En ligne";
      pill.classList.remove("offline");
      pill.classList.add("online");
    } else {
      pill.textContent = "Hors ligne";
      pill.classList.remove("online");
      pill.classList.add("offline");
    }
  }

  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();

  // Build number
  const build = $("buildNum");
  if (build) build.textContent = APP_BUILD;

  // Load default
  loadHome();
}

/* ------------------------------
   DOM READY SAFE
------------------------------ */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}