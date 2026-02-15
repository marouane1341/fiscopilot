const REPO_USER = "marouane1341";
const REPO_NAME = "fiscopilot";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_USER}/${REPO_NAME}/main/`;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function now(){ return Date.now(); }

function getJSON(key, fallback){
  try{ return JSON.parse(localStorage.getItem(key) || ""); } catch { return fallback; }
}
function setJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function syncNow(){
  const statusEl = document.getElementById("syncStatus");
  if(statusEl) statusEl.textContent = "⏳ Synchronisation…";

  try{
    const idx = await fetchJSON(RAW_BASE + "db_index.json");
    setJSON("db_index", idx);
    localStorage.setItem("db_last_sync", String(now()));

    // Précharge les 2 premiers modules pour un offline immédiat
    for(const m of idx.modules.slice(0,2)){
      const mod = await fetchJSON(RAW_BASE + m.db_url);
      setJSON("db_mod_" + m.id, mod);
    }

    if(statusEl) statusEl.textContent = `✅ Sync OK (${idx.updated_at})`;
    return true;
  }catch(e){
    if(statusEl) statusEl.textContent = "⚠️ Sync impossible (offline ?) — mode local actif";
    return false;
  }
}

async function autoSyncWeekly(){
  const last = Number(localStorage.getItem("db_last_sync") || "0");
  if(now() - last > WEEK_MS){
    await syncNow();
  }
}

// Export global
window.__syncNow = syncNow;
window.__autoSyncWeekly = autoSyncWeekly;