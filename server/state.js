const MARKER_LABELS = {
  einsatzort: "Einsatzort",
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

// Rettungsachse ist keine einzelne Position mehr, sondern eine Strecke aus
// mehreren Punkten (wie eine Zone, aber als offene Linie statt Flaeche) -
// damit sie dem tatsaechlichen Strassenverlauf folgen kann.
const ROUTE_LABELS = {
  rettungsachse: "Rettungsachse",
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

const LOG_KATEGORIE_LABELS = {
  front: "Front",
  el: "EL",
  transport: "Transport",
  warteraum: "Warteraum",
  behandlung: "Behandlung",
  mobsanhist: "MobSanHist",
};

function defaultState() {
  return {
    id: "E-" + Date.now().toString(36).toUpperCase(),
    ort: "",
    elsNummer: "",
    status: "Vor Ort",
    anzahlPatienten: 0,
    triage: { t1: 0, t2: 0, t3: 0, t4: 0, schwarz: 0, weiss: 0 },
    bereitstellungsort: null, // {lat, lng}
    markers: {
      einsatzort: null,
      warteraum: null,
      helilandeplatz: null,
      patientensammelstelle: null,
      sanitaetshilfsstelle: null,
      kommandoposten: null,
      sammelstelleunverletzte: null,
    }, // je {lat, lng}
    zones: { gefahrenzone: null, sperrzone: null, verkehrsumleitzone: null }, // je [{lat,lng}, ...] oder null
    routes: { rettungsachse: null }, // je [{lat,lng}, ...] oder null
    fuehrung: {
      gel: "", gelTel: "",
      blFw: "", blFwTel: "",
      blSan: "", blSanTel: "",
      blPol: "", blPolTel: "",
      elFw: "", elFwTel: "",
      elSan: "", elSanTel: "",
      elPol: "", elPolTel: "",
      fu: "", fuTel: "",
      mediendienst: "", mediendienstTel: "",
    },
    skizze: null, // Data-URL (PNG) der gemeinsamen Lageskizze, oder null
    log: [],
    updatedAt: Date.now(),
  };
}

const SKIZZE_MAX_LENGTH = 3 * 1024 * 1024; // Sicherheitsnetz gegen ausufernde Payloads

function clampInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback ?? 0;
}

// Anzahl Patienten wird nicht mehr manuell erfasst, sondern ist immer die
// Summe der Sichtungskategorien - eine einzige Quelle der Wahrheit statt
// zweier Zahlen, die auseinanderlaufen koennen.
function computeAnzahlPatienten(triage) {
  return (
    (triage.t1 || 0) +
    (triage.t2 || 0) +
    (triage.t3 || 0) +
    (triage.t4 || 0) +
    (triage.schwarz || 0) +
    (triage.weiss || 0)
  );
}

function addLog(state, person, text, kategorie, photo) {
  state.log = state.log || [];
  const entry = { zeit: Date.now(), person, text };
  if (kategorie) entry.kategorie = kategorie;
  if (photo) entry.photo = photo;
  state.log.unshift(entry);
}

// Client komprimiert Fotos vor dem Senden (JPEG, max. 1280px) - dieses Limit
// ist nur ein Sicherheitsnetz gegen einen manipulierten/fehlerhaften Client.
const LOG_PHOTO_MAX_LENGTH = 2 * 1024 * 1024;

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
      state.triage = {
        t1: clampInt(payload.triage?.t1, state.triage.t1),
        t2: clampInt(payload.triage?.t2, state.triage.t2),
        t3: clampInt(payload.triage?.t3, state.triage.t3),
        t4: clampInt(payload.triage?.t4, state.triage.t4),
        schwarz: clampInt(payload.triage?.schwarz, state.triage.schwarz),
        weiss: clampInt(payload.triage?.weiss, state.triage.weiss),
      };
      state.anzahlPatienten = computeAnzahlPatienten(state.triage);
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
        schwarz: clampInt(payload.schwarz, state.triage.schwarz),
        weiss: clampInt(payload.weiss, state.triage.weiss),
      };
      state.anzahlPatienten = computeAnzahlPatienten(state.triage);
      addLog(
        state,
        kuerzel,
        `Sichtungskategorien aktualisiert: T1=${state.triage.t1}, T2=${state.triage.t2}, T3=${state.triage.t3}, T4=${state.triage.t4}, Schwarz=${state.triage.schwarz}, Weiss=${state.triage.weiss}`
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

    case "marker:clear": {
      const key = payload.key;
      if (!Object.prototype.hasOwnProperty.call(MARKER_LABELS, key)) {
        throw new Error("Unbekannter Markertyp: " + key);
      }
      state.markers = state.markers || {};
      state.markers[key] = null;
      addLog(state, kuerzel, MARKER_LABELS[key] + " entfernt");
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

    case "route:set": {
      const key = payload.key;
      if (!Object.prototype.hasOwnProperty.call(ROUTE_LABELS, key)) {
        throw new Error("Unbekannter Routentyp: " + key);
      }
      const rawPoints = Array.isArray(payload.points) ? payload.points : [];
      if (rawPoints.length < 2) {
        throw new Error("Eine Strecke braucht mindestens 2 Punkte");
      }
      const points = rawPoints.map((p) => {
        const lat = Number(p.lat);
        const lng = Number(p.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error("Ungültige Koordinaten in Strecke");
        }
        return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
      });
      state.routes = state.routes || {};
      state.routes[key] = points;
      addLog(state, kuerzel, ROUTE_LABELS[key] + " eingezeichnet (" + points.length + " Punkte)");
      break;
    }

    case "route:clear": {
      const key = payload.key;
      if (!Object.prototype.hasOwnProperty.call(ROUTE_LABELS, key)) {
        throw new Error("Unbekannter Routentyp: " + key);
      }
      state.routes = state.routes || {};
      state.routes[key] = null;
      addLog(state, kuerzel, ROUTE_LABELS[key] + " entfernt");
      break;
    }

    case "fuehrung:update": {
      state.fuehrung = state.fuehrung || {};
      const parts = [];
      for (const field of Object.keys(FUEHRUNG_FIELDS)) {
        const telField = field + "Tel";
        if (typeof payload[field] === "string") {
          state.fuehrung[field] = payload[field].trim().toUpperCase().slice(0, 20);
        }
        if (typeof payload[telField] === "string") {
          state.fuehrung[telField] = payload[telField].trim().slice(0, 30);
        }
        if (state.fuehrung[field]) {
          const tel = state.fuehrung[telField] ? " (" + state.fuehrung[telField] + ")" : "";
          parts.push(FUEHRUNG_FIELDS[field] + "=" + state.fuehrung[field] + tel);
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

    case "bereitstellungsort:clear": {
      state.bereitstellungsort = null;
      addLog(state, kuerzel, "Bereitstellungsort entfernt");
      break;
    }

    case "log:add": {
      const text = String(payload.text || "").trim().slice(0, 2000);
      if (!text) throw new Error("Leerer Eintrag");
      const kategorie = payload.kategorie;
      if (!Object.prototype.hasOwnProperty.call(LOG_KATEGORIE_LABELS, kategorie)) {
        throw new Error("Kategorie ist obligatorisch");
      }
      let photo;
      if (payload.photo) {
        const data = String(payload.photo);
        if (!data.startsWith("data:image/")) {
          throw new Error("Ungültiges Bildformat");
        }
        if (data.length > LOG_PHOTO_MAX_LENGTH) {
          throw new Error("Foto ist zu gross");
        }
        photo = data;
      }
      addLog(state, kuerzel, text, kategorie, photo);
      break;
    }

    case "skizze:set": {
      const data = String(payload.data || "");
      if (!data.startsWith("data:image/png;base64,")) {
        throw new Error("Ungültiges Bildformat");
      }
      if (data.length > SKIZZE_MAX_LENGTH) {
        throw new Error("Skizze ist zu gross");
      }
      state.skizze = data;
      addLog(state, kuerzel, "Skizze aktualisiert");
      break;
    }

    default:
      throw new Error("Unbekannter Nachrichtentyp: " + type);
  }

  state.updatedAt = Date.now();
  return state;
}

module.exports = { defaultState, applyMutation, STATUS_OPTIONS, MARKER_LABELS, ZONE_LABELS, FUEHRUNG_FIELDS, LOG_KATEGORIE_LABELS };
