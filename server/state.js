const MARKER_LABELS = {
  einsatzort: "Einsatzort",
  rettungsachse: "Rettungsachse",
  warteraum: "Warteraum",
  helilandeplatz: "Heli-Landeplatz",
  patientensammelstelle: "Patientensammelstelle",
  sanitaetshilfsstelle: "Sanitätshilfsstelle/Transportstelle",
  kommandoposten: "Standort Einsatzleitung",
  sammelstelleunverletzte: "Sammelstelle Unverletzte",
};

const ZONE_LABELS = {
  gefahrenzone: "Gefahrenzone",
  sperrzone: "Sperrzone",
  verkehrsumleitzone: "Verkehrsumleitzone",
};

const FUEHRUNG_FIELDS = {
  gel: "GEL",
  blFw: "BL FW",
  blSan: "BL SAN",
  blPol: "BL POL",
  elFw: "EL FW",
  elSan: "EL SAN",
  elPol: "EL POL",
  fu: "FU",
  mediendienst: "Mediendienst",
};

function defaultState() {
  return {
    id: "E-" + Date.now().toString(36).toUpperCase(),
    ort: "",
    elsNummer: "",
    status: "Vor Ort",
    anzahlPatienten: 0,
    triage: { t1: 0, t2: 0, t3: 0, t4: 0 },
    bereitstellungsort: null, // {lat, lng}
    markers: {
      einsatzort: null,
      rettungsachse: null,
      warteraum: null,
      helilandeplatz: null,
      patientensammelstelle: null,
      sanitaetshilfsstelle: null,
      kommandoposten: null,
      sammelstelleunverletzte: null,
    }, // je {lat, lng}
    zones: { gefahrenzone: null, sperrzone: null, verkehrsumleitzone: null }, // je [{lat,lng}, ...] oder null
    fuehrung: { gel: "", blFw: "", blSan: "", blPol: "", elFw: "", elSan: "", elPol: "", fu: "", mediendienst: "" },
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
      if (typeof payload.elsNummer === "string") {
        state.elsNummer = payload.elsNummer.trim().slice(0, 50);
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

    case "triage:update": {
      state.triage = {
        t1: clampInt(payload.t1, state.triage.t1),
        t2: clampInt(payload.t2, state.triage.t2),
        t3: clampInt(payload.t3, state.triage.t3),
        t4: clampInt(payload.t4, state.triage.t4),
      };
      addLog(
        state,
        kuerzel,
        `Sichtungskategorien aktualisiert: T1=${state.triage.t1}, T2=${state.triage.t2}, T3=${state.triage.t3}, T4=${state.triage.t4}`
      );
      break;
    }

    // Generalisierte Kartenmarker: Einsatzort sowie die taktischen Symbole
    // aus der Checkliste Chef Transport (Rettungsachse, Warteraum,
    // Heli-Landeplatz). Bereitstellungsort bleibt als eigener Mutationstyp
    // bestehen (siehe unten), da er schon vorher existierte.
    case "marker:set": {
      const key = payload.key;
      if (!Object.prototype.hasOwnProperty.call(MARKER_LABELS, key)) {
        throw new Error("Unbekannter Markertyp: " + key);
      }
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Ungültige Koordinaten");
      }
      const pos = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
      state.markers = state.markers || {};
      state.markers[key] = pos;

      if (key === "einsatzort") {
        const address =
          String(payload.address || "").trim().slice(0, 300) ||
          pos.lat + ", " + pos.lng;
        state.ort = address;
        addLog(state, kuerzel, "Einsatzort gesetzt: " + address);
      } else {
        addLog(state, kuerzel, MARKER_LABELS[key] + " markiert: " + pos.lat + ", " + pos.lng);
      }
      break;
    }

    case "zone:set": {
      const key = payload.key;
      if (!Object.prototype.hasOwnProperty.call(ZONE_LABELS, key)) {
        throw new Error("Unbekannter Zonentyp: " + key);
      }
      const rawPoints = Array.isArray(payload.points) ? payload.points : [];
      if (rawPoints.length < 3) {
        throw new Error("Eine Zone braucht mindestens 3 Punkte");
      }
      const points = rawPoints.map((p) => {
        const lat = Number(p.lat);
        const lng = Number(p.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error("Ungültige Koordinaten in Zone");
        }
        return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
      });
      state.zones = state.zones || {};
      state.zones[key] = points;
      addLog(state, kuerzel, ZONE_LABELS[key] + " eingezeichnet (" + points.length + " Punkte)");
      break;
    }

    case "zone:clear": {
      const key = payload.key;
      if (!Object.prototype.hasOwnProperty.call(ZONE_LABELS, key)) {
        throw new Error("Unbekannter Zonentyp: " + key);
      }
      state.zones = state.zones || {};
      state.zones[key] = null;
      addLog(state, kuerzel, ZONE_LABELS[key] + " entfernt");
      break;
    }

    case "fuehrung:update": {
      state.fuehrung = state.fuehrung || {};
      const parts = [];
      for (const field of Object.keys(FUEHRUNG_FIELDS)) {
        if (typeof payload[field] === "string") {
          state.fuehrung[field] = payload[field].trim().toUpperCase().slice(0, 20);
        }
        if (state.fuehrung[field]) {
          parts.push(FUEHRUNG_FIELDS[field] + "=" + state.fuehrung[field]);
        }
      }
      addLog(state, kuerzel, "Führungsstruktur aktualisiert" + (parts.length ? ": " + parts.join(", ") : ""));
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

module.exports = { defaultState, applyMutation, STATUS_OPTIONS, MARKER_LABELS, ZONE_LABELS, FUEHRUNG_FIELDS };
