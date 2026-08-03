const jwt = require("jsonwebtoken");

const TOKEN_TTL = "12h"; // deckt eine lange Einsatz-/Schichtdauer ab

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET ist nicht gesetzt (siehe .env.example)");
  }
  return secret;
}

function login(pin, kuerzel) {
  const expectedPin = process.env.EINSATZ_PIN;
  if (!expectedPin) {
    throw new Error("EINSATZ_PIN ist nicht gesetzt (siehe .env.example)");
  }
  if (typeof pin !== "string" || pin !== expectedPin) {
    return null;
  }
  const cleanKuerzel = String(kuerzel || "").trim().toUpperCase().slice(0, 6);
  if (!cleanKuerzel) {
    return null;
  }
  const token = jwt.sign({ kuerzel: cleanKuerzel }, getSecret(), {
    expiresIn: TOKEN_TTL,
  });
  return { token, kuerzel: cleanKuerzel };
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch (e) {
    return null;
  }
}

module.exports = { login, verifyToken };
