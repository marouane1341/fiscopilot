// ==============================
//  FiscoPilot - Audio (AUTO)
//  1) Worker ElevenLabs (voix humaine)
//  2) Fallback navigateur (Samsung / SpeechSynthesis)
// ==============================

// 👉 Mets TON URL Worker ici :
const AUDIO_WORKER_URL = "https://elevenapikey.marouane1341.workers.dev/";

// Modes: "auto" | "worker" | "browser"
let AUDIO_MODE = "auto";

// Petit état
let lastAudioUrl = null;
let lastAudioBlob = null;

// ---------- Utils UI ----------
function audioLog(msg) {
  // Si tu as déjà une zone de log dans l’app, branche-la ici.
  console.log("[AUDIO]", msg);
}

// ---------- Fallback navigateur (gratuit) ----------
function browserSpeak(text) {
  return new Promise((resolve, reject) => {
    try {
      if (!("speechSynthesis" in window)) {
        return reject(new Error("SpeechSynthesis non supporté"));
      }

      // Stop tout ce qui parle déjà
      window.speechSynthesis.cancel();

      const utter = new SpeechSynthesisUtterance(text);

      // Choix voix FR si possible (souvent Samsung FR sur Android)
      const voices = window.speechSynthesis.getVoices?.() || [];
      const fr = voices.filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
      if (fr.length) {
        // Essaie de prendre la voix la plus “naturelle” (Samsung/Google)
        const preferred =
          fr.find(v => /samsung/i.test(v.name)) ||
          fr.find(v => /google/i.test(v.name)) ||
          fr[0];
        utter.voice = preferred;
      }

      // Réglages (à ajuster)
      utter.rate = 1.02;   // vitesse
      utter.pitch = 1.0;   // tonalité
      utter.volume = 1.0;

      utter.onend = () => resolve({ mode: "browser" });
      utter.onerror = (e) => reject(new Error(e?.error || "Erreur SpeechSynthesis"));

      window.speechSynthesis.speak(utter);
    } catch (err) {
      reject(err);
    }
  });
}

// Important sur Android : la liste des voix arrive parfois après un “prime”
if ("speechSynthesis" in window && window.speechSynthesis.getVoices) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    // juste pour initialiser
  };
}

// ---------- Worker ElevenLabs ----------
async function workerSpeak(text) {
  const res = await fetch(AUDIO_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  // Si le worker renvoie une erreur JSON
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      if (ct.includes("application/json")) {
        const j = await res.json();
        detail = j?.detail?.message || j?.message || JSON.stringify(j);
      } else {
        detail = await res.text();
      }
    } catch (_) {}
    throw new Error(`Worker error: ${detail}`);
  }

  // Audio attendu
  if (!ct.includes("audio/")) {
    // Peut arriver si ElevenLabs renvoie un JSON “unusual activity”
    const maybeText = ct.includes("application/json") ? JSON.stringify(await res.json()) : await res.text();
    throw new Error(`Réponse non-audio: ${maybeText.slice(0, 200)}`);
  }

  const blob = await res.blob();
  lastAudioBlob = blob;

  // Crée une URL locale pour lecture
  if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
  lastAudioUrl = URL.createObjectURL(blob);

  // Lecture
  const player = new Audio();
  player.src = lastAudioUrl;
  await player.play();

  return { mode: "worker", bytes: blob.size, contentType: ct };
}

// ---------- Fonction principale : AUTO ----------
async function speak(text) {
  if (!text || !String(text).trim()) {
    audioLog("⛔ Texte vide");
    return;
  }

  // Si aucun worker renseigné
  const hasWorker = AUDIO_WORKER_URL && AUDIO_WORKER_URL.startsWith("http");

  try {
    if (AUDIO_MODE === "browser") {
      audioLog("🔊 Mode navigateur");
      return await browserSpeak(text);
    }

    if (AUDIO_MODE === "worker") {
      if (!hasWorker) throw new Error("AUDIO_WORKER_URL manquant");
      audioLog("🎙️ Mode worker (forcé)");
      const r = await workerSpeak(text);
      audioLog(`✅ Worker OK (${Math.round(r.bytes / 1024)} KB)`);
      return r;
    }

    // AUTO
    if (hasWorker) {
      audioLog("🎙️ AUTO: essai worker…");
      const r = await workerSpeak(text);
      audioLog(`✅ Worker OK (${Math.round(r.bytes / 1024)} KB)`);
      return r;
    }

    audioLog("🔊 AUTO: pas de worker → navigateur");
    return await browserSpeak(text);
  } catch (err) {
    // Fallback automatique
    audioLog(`⚠️ Worker KO → fallback navigateur. Détail: ${err?.message || err}`);
    return await browserSpeak(text);
  }
}

// ---------- Exemple : branche ton bouton Audio ----------
/*
document.getElementById("btnAudio").addEventListener("click", async () => {
  const text = document.getElementById("lessonText").innerText;
  await speak(text);
});
*/

// ---------- Option : changer de mode depuis ta console ----------
window.FISCO_AUDIO = {
  setMode: (m) => { AUDIO_MODE = m; audioLog(`Mode audio = ${m}`); },
  speak,
};