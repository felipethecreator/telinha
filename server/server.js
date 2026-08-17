// Telinha — servidor de sinalização WebRTC
// Só apresenta os navegadores uns aos outros; o vídeo vai direto P2P.

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import path from "path";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_PEERS_POR_SALA = 8;

const app = express();
app.use(express.static(path.join(__dirname, "public")));

// Servidores ICE (STUN/TURN) que o frontend deve usar.
// STUN é grátis e resolve a maioria dos casos; TURN é o retransmissor
// usado quando o P2P direto falha (CGNAT, 5G etc.) — configure por env vars:
//   CF_TURN_KEY_ID + CF_TURN_API_TOKEN  -> TURN da Cloudflare (recomendado, ~1TB/mês grátis)
//   TURN_URL + TURN_USERNAME + TURN_CREDENTIAL -> qualquer outro provedor (ex.: Metered)
const STUN_FALLBACK = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

app.get("/ice", async (_req, res) => {
  const { CF_TURN_KEY_ID, CF_TURN_API_TOKEN, TURN_URL, TURN_USERNAME, TURN_CREDENTIAL } =
    process.env;
  try {
    if (CF_TURN_KEY_ID && CF_TURN_API_TOKEN) {
      // gera credenciais temporárias (24h) na Cloudflare
      const endpoints = [
        `https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate-ice-servers`,
        `https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate`,
      ];
      for (const url of endpoints) {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CF_TURN_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: 86400 }),
        });
        if (r.ok) {
          const data = await r.json();
          const servers = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
          return res.json({ iceServers: [...STUN_FALLBACK, ...servers] });
        }
      }
      console.warn("TURN da Cloudflare indisponível — caindo pro fallback");
    }
    if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
      return res.json({
        iceServers: [
          ...STUN_FALLBACK,
          {
            urls: TURN_URL.split(",").map((s) => s.trim()),
            username: TURN_USERNAME,
            credential: TURN_CREDENTIAL,
          },
        ],
      });
    }
  } catch (err) {
    console.warn("erro montando /ice:", err.message);
  }
  res.json({ iceServers: STUN_FALLBACK });
});

// SPA fallback: qualquer rota /sala/XXXX serve o index
app.get("/sala/:code", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

/** salas: code -> Map<peerId, { ws, name, sharing }> */
const salas = new Map();

function gerarCodigo() {
  // 6 caracteres fáceis de ditar no grupo (sem 0/O, 1/I/L)
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), (b) => chars[b % chars.length]).join("");
  } while (salas.has(code));
  return code;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(code, msg, exceptId = null) {
  const sala = salas.get(code);
  if (!sala) return;
  for (const [id, peer] of sala) {
    if (id !== exceptId) send(peer.ws, msg);
  }
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  let myId = null;
  let myRoom = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "create-room": {
        const code = gerarCodigo();
        salas.set(code, new Map());
        send(ws, { type: "room-created", room: code });
        break;
      }

      case "join": {
        const code = String(msg.room || "").toUpperCase().trim();
        const name = String(msg.name || "").trim().slice(0, 24) || "Anônimo";
        const sala = salas.get(code);
        if (!sala) {
          send(ws, { type: "error", code: "sala-nao-existe", message: "Essa sala não existe (ou já foi fechada)." });
          return;
        }
        if (sala.size >= MAX_PEERS_POR_SALA) {
          send(ws, { type: "error", code: "sala-cheia", message: "A sala está cheia." });
          return;
        }
        if (myRoom) return; // já está numa sala

        myId = crypto.randomUUID();
        myRoom = code;
        const peers = Array.from(sala, ([id, p]) => ({ id, name: p.name, sharing: p.sharing }));
        sala.set(myId, { ws, name, sharing: false });
        send(ws, { type: "joined", you: myId, room: code, peers });
        broadcast(code, { type: "peer-joined", id: myId, name }, myId);
        break;
      }

      case "share-start":
      case "share-stop": {
        const sala = salas.get(myRoom);
        if (!sala || !myId) return;
        const me = sala.get(myId);
        if (!me) return;
        me.sharing = msg.type === "share-start";
        broadcast(myRoom, { type: msg.type, id: myId }, myId);
        break;
      }

      case "signal": {
        // relay de offer/answer/candidate para um peer específico
        const sala = salas.get(myRoom);
        if (!sala || !myId) return;
        const dest = sala.get(msg.to);
        if (!dest) return;
        send(dest.ws, { type: "signal", from: myId, channel: msg.channel, data: msg.data });
        break;
      }
    }
  });

  ws.on("close", () => {
    if (!myRoom || !myId) return;
    const sala = salas.get(myRoom);
    if (!sala) return;
    sala.delete(myId);
    broadcast(myRoom, { type: "peer-left", id: myId });
    if (sala.size === 0) salas.delete(myRoom);
  });
});

// mantém conexões vivas (e derruba as mortas) — importante em free tiers
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);
wss.on("close", () => clearInterval(heartbeat));

httpServer.listen(PORT, () => {
  console.log(`Telinha rodando em http://localhost:${PORT}`);
});
