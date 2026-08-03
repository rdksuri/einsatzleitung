const { WebSocketServer } = require("ws");
const { verifyToken } = require("./auth");
const { loadState, saveState } = require("./db");
const { defaultState, applyMutation } = require("./state");
const { reverseGeocode } = require("./geocode");

function createWsHub(server) {
  let state = loadState() || defaultState();
  if (!loadState()) saveState(state);

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get("token");
    const payload = verifyToken(token);
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!payload) {
        // Handshake sauber abschliessen und mit eindeutigem Code schliessen,
        // damit der Client Auth-Fehler von einem Netzwerk-Abbruch unterscheiden kann.
        ws.close(4401, "unauthorized");
        return;
      }
      ws.kuerzel = payload.kuerzel;
      wss.emit("connection", ws, req);
    });
  });

  function send(ws, type, payload) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  function broadcastState() {
    saveState(state);
    for (const ws of clients) {
      send(ws, "state:full", state);
    }
  }

  wss.on("connection", (ws) => {
    clients.add(ws);
    send(ws, "state:full", state);

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        send(ws, "error", { message: "Ungültige Nachricht" });
        return;
      }
      try {
        if (msg.type === "marker:set" && msg.payload?.key === "einsatzort") {
          const address = await reverseGeocode(msg.payload.lat, msg.payload.lng);
          msg = { ...msg, payload: { ...msg.payload, address } };
        }
        state = applyMutation(state, msg, ws.kuerzel);
        broadcastState();
      } catch (e) {
        send(ws, "error", { message: e.message });
      }
    });

    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  return wss;
}

module.exports = { createWsHub };
