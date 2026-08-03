function defaultState() {
  return {
    id: "E-" + Date.now().toString(36).toUpperCase(),
    ort: "",
    status: "Vor Ort",
    anzahlPatienten: 0,
    triage: { t1: 0, t2: 0, t3: 0, t4: 0 },
    bereitstellungsort: null, // {lat, lng}
    log: [],
    updatedAt: Date.now(),
  };
}

function clampInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback ?? 0;
}

function addLog(state, person, text) {
  state.log = state.log || [];
  state.log.unshift({ zeit: Date.now(), person, text });
}

const STATUS_OPTIONS = [
  "Alarmiert",
  "Anfahrt",
  "Vor Ort",
  "Sichtung läuft",
  "Abtransport läuft",
  "Abgeschlossen",
];

// Wendet eine Client-Mutation serverseitig auf den autoritativen State an.
// Der Server ist die einzige Quelle der Wahrheit; Clients senden Absichten
// (Intents), keine kompletten State-Kopien - das verhindert verlorene
// Updates bei gleichzeitigen Änderungen mehrerer Personen.
function applyMutation(state, msg, kuerzel) {
  const { type, payload = {} } = msg || {};

  switch (type) {
    case "einsatz:update": {
      if (typeof payload.ort === "string") {
        state.ort = payload.ort.slice(0, 200);
      }
      if (STATUS_OPTIONS.includes(payload.status)) {
        state.status = payload.status;
      }
      state.anzahlPatienten = clampInt(
        payload.anzahlPatienten,
        state.anzahlPatienten
      );
      state.triage = {
        t1: clampInt(payload.triage?.t1, state.triage.t1),
        t2: clampInt(payload.triage?.t2, state.triage.t2),
        t3: clampInt(payload.triage?.t3, state.triage.t3),
        t4: clampInt(payload.triage?.t4, state.triage.t4),
      };
      addLog(state, kuerzel, "Einsatzdaten aktualisiert (Status: " + state.status + ")");
      break;
    }

    case "einsatz:new": {
      state = defaultState();
      break;
    }

    case "bereitstellungsort:set": {
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Ungültige Koordinaten");
      }
      state.bereitstellungsort = {
        lat: +lat.toFixed(6),
        lng: +lng.toFixed(6),
      };
      addLog(
        state,
        kuerzel,
        "Bereitstellungsort gesetzt: " +
          state.bereitstellungsort.lat +
          ", " +
          state.bereitstellungsort.lng
      );
      break;
    }

    case "log:add": {
      const text = String(payload.text || "").trim().slice(0, 2000);
      if (!text) throw new Error("Leerer Eintrag");
      addLog(state, kuerzel, text);
      break;
    }

    default:
      throw new Error("Unbekannter Nachrichtentyp: " + type);
  }

  state.updatedAt = Date.now();
  return state;
}

module.exports = { defaultState, applyMutation, STATUS_OPTIONS };
