const USER_AGENT = "Einsatzleitung-App (https://github.com/rdksuri/einsatzleitung)";

// Loest Koordinaten in eine lesbare Adresse auf (OpenStreetMap Nominatim,
// kostenlos, kein API-Key). Bei Fehlern/Timeout wird null zurueckgegeben,
// der Aufrufer faellt dann auf die reinen Koordinaten zurueck.
// Baut aus den strukturierten Nominatim-Adressfeldern eine kurze,
// Schweizer-typische Adresse ("Strasse Nr, PLZ Ort") statt des vollen,
// sehr langen display_name mit kompletter Verwaltungshierarchie.
function formatAddress(data) {
  const a = data.address || {};
  const street = a.road || a.pedestrian || a.footway;
  const houseNumber = a.house_number;
  const place = a.city || a.town || a.village || a.municipality || a.suburb;
  const line1 = [street, houseNumber].filter(Boolean).join(" ");
  const line2 = [a.postcode, place].filter(Boolean).join(" ");
  const combined = [line1, line2].filter(Boolean).join(", ");
  return combined || data.display_name || null;
}

async function reverseGeocode(lat, lng) {
  try {
    const url =
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
      encodeURIComponent(lat) +
      "&lon=" +
      encodeURIComponent(lng) +
      "&zoom=18&addressdetails=1";
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return formatAddress(data);
  } catch (e) {
    return null;
  }
}

// Gegenrichtung zu reverseGeocode(): loest eine manuell eingetippte Adresse
// in Koordinaten auf, damit der Einsatzort-Pin automatisch mitgesetzt werden
// kann. Auf die Schweiz eingeschraenkt (countrycodes=ch), da die App auf
// kantonale Einsaetze ausgelegt ist.
async function geocodeAddress(address) {
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ch&q=" +
      encodeURIComponent(address);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (e) {
    return null;
  }
}

module.exports = { reverseGeocode, geocodeAddress };
