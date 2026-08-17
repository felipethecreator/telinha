// Telinha — servidor de sinalização WebRTC
// Só apresenta os navegadores uns aos outros; o vídeo vai direto P2P.

import express from "express";
import net from "net";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import path from "path";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MAX_PEERS_POR_SALA = 8;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- consumo do TURN (Cloudflare GraphQL) ----------
// Env vars: CF_ACCOUNT_ID (ID da conta) + CF_ANALYTICS_TOKEN (token com Account Analytics: Read)
const TURN_LIMITE_GB = Number(process.env.TURN_LIMITE_GB || 950);

async function consultaUsoTurn() {
  const now = new Date();
  const inicio = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  if (process.env.USO_MOCK) {
    // dados de demonstração (pra testar a página sem a Cloudflare configurada)
    const dias = Array.from({ length: 17 }, (_, i) => ({
      date: `${inicio.slice(0, 8)}${String(i + 1).padStart(2, "0")}`,
      gb: Math.round((Math.sin(i / 3) ** 2 * 9 + 1.5) * 10) / 10,
    }));
    return { totalGB: dias.reduce((s, d) => s + d.gb, 0), dias, inicio };
  }
  const query = `
    query($accountTag: string!, $inicio: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          callsTurnUsageAdaptiveGroups(filter: { date_geq: $inicio }, limit: 1000) {
            dimensions { date }
            sum { egressBytes ingressBytes }
          }
        }
      }
    }`;
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CF_ANALYTICS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { accountTag: process.env.CF_ACCOUNT_ID, inicio },
    }),
  });
  const data = await r.json();
  if (data.errors?.length) throw new Error(data.errors[0].message);
  const grupos = data?.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups || [];
  const dias = grupos
    .map((g) => ({
      date: g.dimensions.date,
      gb: (g.sum.egressBytes + g.sum.ingressBytes) / 1e9,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { totalGB: dias.reduce((s, d) => s + d.gb, 0), dias, inicio };
}

// guarda: se o consumo do mês passar do limite, o /ice para de entregar TURN
// (o P2P direto continua funcionando; só o relay desliga até virar o mês)
let usoCache = { at: 0, totalGB: 0, valido: false };
async function turnDentroDoLimite() {
  if (!process.env.CF_ACCOUNT_ID || !process.env.CF_ANALYTICS_TOKEN) return true;
  if (Date.now() - usoCache.at > 15 * 60_000) {
    try {
      const { totalGB } = await consultaUsoTurn();
      usoCache = { at: Date.now(), totalGB, valido: true };
    } catch (err) {
      console.warn("não deu pra checar o uso do TURN:", err.message);
      usoCache = { ...usoCache, at: Date.now(), valido: usoCache.valido };
    }
  }
  return !usoCache.valido || usoCache.totalGB < TURN_LIMITE_GB;
}

// Servidores ICE (STUN/TURN) que o frontend deve usar.
// STUN é grátis e resolve a maioria dos casos; TURN é o retransmissor
// usado quando o P2P direto falha (CGNAT, 5G etc.) — configure por env vars:
//   CF_TURN_KEY_ID + CF_TURN_API_TOKEN  -> TURN da Cloudflare (recomendado, ~1TB/mês grátis)
//   TURN_URL + TURN_USERNAME + TURN_CREDENTIAL -> qualquer outro provedor (ex.: Metered)
const STUN_FALLBACK = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ---------- coturn próprio (relay principal) ----------
// Env vars: COTURN_HOST (IP/domínio da sua VM) + COTURN_SECRET (gerado pelo setup-coturn.sh)
// Se o coturn estiver de pé, ele é o relay entregue; a Cloudflare vira fallback.
const COTURN_HOST = process.env.COTURN_HOST;
const COTURN_SECRET = process.env.COTURN_SECRET;
const COTURN_PORT = Number(process.env.COTURN_PORT || 3478);

let coturnCache = { at: 0, ok: false };
function coturnSaudavel() {
  return new Promise((resolve) => {
    if (!COTURN_HOST || !COTURN_SECRET) return resolve(false);
    if (Date.now() - coturnCache.at < 5 * 60_000) return resolve(coturnCache.ok);
    const sock = net.connect({ host: COTURN_HOST, port: COTURN_PORT, timeout: 3000 });
    let respondido = false;
    const done = (ok) => {
      if (respondido) return;
      respondido = true;
      coturnCache = { at: Date.now(), ok };
      if (!ok) console.warn("coturn fora do ar — usando o fallback (Cloudflare)");
      sock.destroy();
      resolve(ok);
    };
    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  });
}

// credenciais temporárias (REST auth do coturn): usuário = timestamp de expiração,
// senha = HMAC-SHA1 do usuário com o segredo compartilhado
function credenciaisCoturn() {
  const usuario = `${Math.floor(Date.now() / 1000) + 21600}:telinha`; // vale 6h
  const senha = crypto.createHmac("sha1", COTURN_SECRET).update(usuario).digest("base64");
  return {
    urls: [
      `turn:${COTURN_HOST}:${COTURN_PORT}?transport=udp`,
      `turn:${COTURN_HOST}:${COTURN_PORT}?transport=tcp`,
    ],
    username: usuario,
    credential: senha,
  };
}

app.get("/ice", async (_req, res) => {
  const { CF_TURN_KEY_ID, CF_TURN_API_TOKEN, TURN_URL, TURN_USERNAME, TURN_CREDENTIAL } =
    process.env;
  try {
    // 1º: coturn próprio (Oracle) — de graça até 10TB/mês
    if (await coturnSaudavel()) {
      return res.json({ iceServers: [...STUN_FALLBACK, credenciaisCoturn()], relay: "coturn" });
    }
    // 2º: Cloudflare (fallback se o coturn estiver fora)
    if (CF_TURN_KEY_ID && CF_TURN_API_TOKEN) {
      // trava de custo: estourou o limite do mês? só STUN até virar o mês
      if (!(await turnDentroDoLimite())) {
        console.warn(`TURN pausado: consumo do mês passou de ${TURN_LIMITE_GB}GB`);
        return res.json({ iceServers: STUN_FALLBACK, turnPausado: true });
      }
      // gera credenciais temporárias (6h) na Cloudflare
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
          body: JSON.stringify({ ttl: 21600 }), // 6h: se o limite estourar, o relay morre em poucas horas
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

// ---------- página /uso (protegida por login via env vars USO_USER/USO_PASS) ----------
app.get("/uso", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const usoSessoes = new Map(); // token -> expira em (12h)
const loginErros = new Map(); // ip -> { count, ate }

app.post("/api/uso/login", (req, res) => {
  const { USO_USER, USO_PASS } = process.env;
  if (!USO_USER || !USO_PASS) {
    return res.status(503).json({ error: "Login não configurado (defina USO_USER e USO_PASS no servidor)." });
  }
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
  const erros = loginErros.get(ip);
  if (erros && erros.count >= 5 && Date.now() < erros.ate) {
    return res.status(429).json({ error: "Muitas tentativas — espera 1 minuto." });
  }
  const { user, pass } = req.body || {};
  if (user === USO_USER && pass === USO_PASS) {
    loginErros.delete(ip);
    const token = crypto.randomUUID();
    usoSessoes.set(token, Date.now() + 12 * 3600e3);
    return res.json({ token });
  }
  loginErros.set(ip, { count: (erros?.count || 0) + 1, ate: Date.now() + 60e3 });
  res.status(401).json({ error: "Usuário ou senha errados." });
});

app.get("/api/uso/dados", async (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const expira = usoSessoes.get(token);
  if (!expira || Date.now() > expira) {
    usoSessoes.delete(token);
    return res.status(401).json({ error: "Sessão expirada — faz login de novo." });
  }
  if (!process.env.USO_MOCK && (!process.env.CF_ACCOUNT_ID || !process.env.CF_ANALYTICS_TOKEN)) {
    return res.status(503).json({
      error: "Falta configurar CF_ACCOUNT_ID e CF_ANALYTICS_TOKEN no servidor pra consultar o consumo.",
    });
  }
  try {
    const uso = await consultaUsoTurn();
    res.json({
      ...uso,
      limiteGB: TURN_LIMITE_GB,
      gratisGB: 1000,
      turnAtivo: uso.totalGB < TURN_LIMITE_GB,
    });
  } catch (err) {
    res.status(502).json({ error: `Erro consultando a Cloudflare: ${err.message}` });
  }
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
