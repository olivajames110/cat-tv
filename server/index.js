// Cat TV server: serves the built app and runs the play queue over WebSocket.
//
//   display (the TV, "/")        ← receives queue state + move deltas
//   player  (a phone, "/play")   → joins the queue, sends move deltas on its turn
//   admin   ("/admin")           → sets max session length, skips / kicks players

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { DEFAULT_LOOK, sanitizeLookPatch } from "../src/shared/look.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../dist");
const DATA_DIR = path.resolve(__dirname, "../data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const PORT = Number(process.env.PORT) || 3001;
const PUBLIC_URL = process.env.PUBLIC_URL || null; // e.g. https://cat-tv.example.com
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString("hex");

// A QR token stays valid for two rotations, so phones must scan the TV's
// current code — an old shared link stops working after a couple of minutes.
const TOKEN_ROTATE_MS = 60_000;
const ACTIVE_GRACE_MS = 10_000; // active player may drop this long before losing the turn
const QUEUED_GRACE_MS = 30_000; // queued player may drop this long before losing their spot
const MAX_NAME_LEN = 20;

// ─── Settings ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = { maxSessionSeconds: 150, look: DEFAULT_LOOK };

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      look: { ...DEFAULT_LOOK, ...sanitizeLookPatch(saved.look) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

let settings = loadSettings();

// ─── Join tokens ─────────────────────────────────────────────────────────────

let joinToken = crypto.randomBytes(8).toString("hex");
let prevJoinToken = null;

setInterval(() => {
  prevJoinToken = joinToken;
  joinToken = crypto.randomBytes(8).toString("hex");
  broadcastState();
}, TOKEN_ROTATE_MS);

const isValidToken = (t) => t && (t === joinToken || t === prevJoinToken);

// ─── Queue ───────────────────────────────────────────────────────────────────

// queue[0] is the active player once `active` is set.
// Entry: { clientId, name, disconnectedAt }
let queue = [];
let active = null; // { clientId, endsAt }
let playerCount = 0;

const sockets = new Set(); // every connected ws, tagged with ws.role / ws.clientId

function findEntry(clientId) {
  return queue.find((e) => e.clientId === clientId);
}

function removeFromQueue(clientId, reason) {
  const idx = queue.findIndex((e) => e.clientId === clientId);
  if (idx === -1) return;
  queue.splice(idx, 1);
  if (active?.clientId === clientId) active = null;
  sendToPlayer(clientId, { type: "ended", reason });
}

function advance() {
  if (active || queue.length === 0) return;
  const next = queue[0];
  active = {
    clientId: next.clientId,
    endsAt: Date.now() + settings.maxSessionSeconds * 1000,
  };
  sendToPlayer(next.clientId, { type: "yourTurn" });
}

// One tick drives session expiry and drops players whose phones went away.
setInterval(() => {
  const now = Date.now();
  let changed = false;

  if (active && now >= active.endsAt) {
    removeFromQueue(active.clientId, "timeUp");
    changed = true;
  }

  for (const e of [...queue]) {
    if (e.disconnectedAt == null) continue;
    const grace =
      active?.clientId === e.clientId ? ACTIVE_GRACE_MS : QUEUED_GRACE_MS;
    if (now - e.disconnectedAt > grace) {
      removeFromQueue(e.clientId, "disconnected");
      changed = true;
    }
  }

  if (!active && queue.length > 0) {
    advance();
    changed = true;
  }
  if (changed) broadcastState();
}, 500);

// ─── State fan-out ───────────────────────────────────────────────────────────

function lanHost() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

function publicState() {
  const activeEntry = active && findEntry(active.clientId);
  return {
    active: activeEntry
      ? { name: activeEntry.name, remainingMs: active.endsAt - Date.now() }
      : null,
    queueLength: queue.length - (active ? 1 : 0),
    upNext: queue.slice(active ? 1 : 0, active ? 4 : 3).map((e) => e.name),
    maxSessionSeconds: settings.maxSessionSeconds,
    look: settings.look,
  };
}

function stateFor(ws) {
  const base = { type: "state", ...publicState() };

  if (ws.role === "display") {
    return { ...base, joinToken, lanHost: lanHost(), publicUrl: PUBLIC_URL };
  }

  if (ws.role === "player") {
    const idx = queue.findIndex((e) => e.clientId === ws.clientId);
    const isActive = active?.clientId === ws.clientId;
    return {
      ...base,
      you:
        idx === -1
          ? { status: "idle" }
          : {
              status: isActive ? "active" : "queued",
              name: queue[idx].name,
              position: isActive ? 0 : idx + (active ? 0 : 1),
              remainingMs: isActive ? active.endsAt - Date.now() : null,
            },
    };
  }

  if (ws.role === "admin" && ws.authed) {
    return {
      ...base,
      queue: queue.map((e) => ({
        clientId: e.clientId,
        name: e.name,
        active: active?.clientId === e.clientId,
        connected: e.disconnectedAt == null,
      })),
    };
  }

  return base;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastState() {
  for (const ws of sockets) send(ws, stateFor(ws));
}

function sendToPlayer(clientId, msg) {
  for (const ws of sockets) {
    if (ws.role === "player" && ws.clientId === clientId) send(ws, msg);
  }
}

function sendToDisplays(msg) {
  const data = JSON.stringify(msg);
  for (const ws of sockets) {
    if (ws.role === "display" && ws.readyState === ws.OPEN) ws.send(data);
  }
}

// ─── Message handling ────────────────────────────────────────────────────────

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

const finite = (n) => typeof n === "number" && Number.isFinite(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// The TV's own panel and the active phone may both change the look.
function handleLook(ws, msg) {
  const canEdit =
    ws.role === "display" ||
    (ws.role === "player" && active?.clientId === ws.clientId);
  const patch = canEdit && sanitizeLookPatch(msg.patch);
  if (!patch) return;
  settings.look = { ...settings.look, ...patch };
  scheduleSave();
  broadcastState();
}

// Slider drags send many looks a second; write the file at most once a second.
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSettings();
  }, 1000);
}

// "Play sound" taps from the active phone, rate-limited, relayed to the TV.
const SOUND_MIN_GAP_MS = 250;
function handleSound(ws) {
  if (ws.role !== "player" || active?.clientId !== ws.clientId) return;
  const now = Date.now();
  if (now - (ws.lastSoundAt ?? 0) < SOUND_MIN_GAP_MS) return;
  ws.lastSoundAt = now;
  sendToDisplays({ type: "sound" });
}

function handleMessage(ws, msg) {
  if (msg.type === "look") {
    handleLook(ws, msg);
    return;
  }
  if (msg.type === "sound") {
    handleSound(ws);
    return;
  }

  if (msg.type === "hello") {
    if (msg.role === "display") ws.role = "display";
    else if (msg.role === "player" && typeof msg.clientId === "string") {
      ws.role = "player";
      ws.clientId = msg.clientId.slice(0, 64);
      const entry = findEntry(ws.clientId);
      if (entry) entry.disconnectedAt = null;
    } else if (msg.role === "admin") {
      ws.role = "admin";
      ws.authed = safeEqual(msg.password, ADMIN_PASSWORD);
      send(ws, { type: "auth", ok: ws.authed });
    }
    broadcastState();
    return;
  }

  if (ws.role === "player") {
    switch (msg.type) {
      case "join": {
        if (findEntry(ws.clientId)) return;
        if (!isValidToken(msg.token)) {
          send(ws, { type: "error", code: "badToken" });
          return;
        }
        playerCount += 1;
        const name =
          String(msg.name ?? "").trim().slice(0, MAX_NAME_LEN) ||
          `Player ${playerCount}`;
        queue.push({ clientId: ws.clientId, name, disconnectedAt: null });
        advance();
        broadcastState();
        return;
      }
      case "leave":
        removeFromQueue(ws.clientId, "left");
        advance();
        broadcastState();
        return;
      case "move":
        // Deltas are fractions of the phone's touch-pad width; the display
        // scales them to its own size.
        if (active?.clientId !== ws.clientId) return;
        if (!finite(msg.dx) || !finite(msg.dy)) return;
        sendToDisplays({
          type: "move",
          dx: clamp(msg.dx, -1, 1),
          dy: clamp(msg.dy, -1, 1),
        });
        return;
    }
    return;
  }

  if (ws.role === "admin" && ws.authed) {
    switch (msg.type) {
      case "settings":
        if (finite(msg.maxSessionSeconds)) {
          settings.maxSessionSeconds = clamp(
            Math.round(msg.maxSessionSeconds),
            10,
            3600
          );
          saveSettings();
          broadcastState();
        }
        return;
      case "skip":
        if (active) removeFromQueue(active.clientId, "skipped");
        advance();
        broadcastState();
        return;
      case "kick":
        removeFromQueue(String(msg.clientId), "kicked");
        advance();
        broadcastState();
        return;
      case "clear":
        for (const e of [...queue]) removeFromQueue(e.clientId, "kicked");
        broadcastState();
        return;
    }
  }
}

// ─── HTTP (static dist + SPA fallback) ───────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(DIST_DIR, urlPath);
  if (!file.startsWith(DIST_DIR)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST_DIR, "index.html");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res
        .writeHead(404, { "Content-Type": "text/plain" })
        .end("Not built yet — run `npm run build`, or use `npm run dev`.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  sockets.add(ws);
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg && typeof msg.type === "string") handleMessage(ws, msg);
  });
  ws.on("close", () => {
    sockets.delete(ws);
    if (ws.role === "player") {
      const stillConnected = [...sockets].some(
        (s) => s.role === "player" && s.clientId === ws.clientId
      );
      const entry = findEntry(ws.clientId);
      if (entry && !stillConnected) entry.disconnectedAt = Date.now();
    }
    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`Cat TV server on http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(
      `ADMIN_PASSWORD not set — using generated password: ${ADMIN_PASSWORD}`
    );
  }
});
