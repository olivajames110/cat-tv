import { useEffect, useRef, useState } from "react";
import { Box, Button, Tab, Tabs, TextField, Typography } from "@mui/material";
import useCatSocket, { fmtSeconds, useCountdown } from "./useCatSocket.js";
import useSharedLook from "./useSharedLook.js";
import LookControls from "../LookControls.jsx";

function getClientId() {
  try {
    let id = localStorage.getItem("catTvClientId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("catTvClientId", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// The join token comes from the TV's QR code. Strip it from the URL so a
// reload or a shared link can't rejoin once this turn is over.
function takeTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("t");
  if (token) window.history.replaceState(null, "", window.location.pathname);
  return token;
}

const ENDED_TEXT = {
  timeUp: "Time's up!",
  skipped: "Your turn was ended by the admin.",
  kicked: "You were removed from the line.",
  disconnected: "You lost your spot after disconnecting.",
  left: "You left the line.",
};

const shell = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: "radial-gradient(ellipse at 50% 0%, #312e81 0%, #0f0a2e 70%)",
  color: "white",
  fontFamily: "'Trebuchet MS', sans-serif",
  overflow: "hidden",
};

export default function PlayerPage() {
  const [clientId] = useState(getClientId);
  const [token, setToken] = useState(takeTokenFromUrl);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("catTvName") ?? "";
    } catch {
      return "";
    }
  });
  const [ended, setEnded] = useState(null);
  const [error, setError] = useState(null);

  const { look, editLook, onState: onLookState } = useSharedLook();
  const { connected, state, send } = useCatSocket(
    { role: "player", clientId },
    (msg) => {
      if (msg.type === "state") {
        onLookState(msg);
      } else if (msg.type === "ended") {
        setEnded(msg.reason);
        setToken(null);
      } else if (msg.type === "yourTurn") {
        navigator.vibrate?.([120, 60, 120]);
      } else if (msg.type === "error" && msg.code === "badToken") {
        setError("That QR code has expired. Scan the code on the TV again.");
        setToken(null);
      }
    }
  );

  const updateLook = (patch) => {
    editLook(patch);
    send({ type: "look", patch });
  };

  const you = state?.you;
  const status = you?.status ?? "idle";

  const join = () => {
    try {
      localStorage.setItem("catTvName", name);
    } catch {
      /* ignore */
    }
    setEnded(null);
    setError(null);
    send({ type: "join", name, token });
  };

  if (!connected && !state) {
    return (
      <Box sx={{ ...shell, alignItems: "center", justifyContent: "center" }}>
        <Typography>Connecting…</Typography>
      </Box>
    );
  }

  if (status === "active") {
    return (
      <Trackpad
        you={you}
        send={send}
        connected={connected}
        look={look}
        onLookChange={updateLook}
      />
    );
  }

  return (
    <Box
      sx={{
        ...shell,
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        p: 3,
        textAlign: "center",
      }}
    >
      <Typography sx={{ fontSize: 28, fontWeight: 700 }}>🐱 Cat TV</Typography>

      {status === "queued" && (
        <>
          <Typography sx={{ fontSize: 20 }}>
            You're in line, {you.name}!
          </Typography>
          <Typography sx={{ fontSize: 64, fontWeight: 700, lineHeight: 1 }}>
            #{you.position}
          </Typography>
          <Typography sx={{ opacity: 0.7 }}>
            {you.position === 1 ? "You're up next." : `${you.position - 1} ahead of you.`}{" "}
            Keep this page open — your phone will buzz when it's your turn.
          </Typography>
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => send({ type: "leave" })}
          >
            Leave line
          </Button>
        </>
      )}

      {status === "idle" && (
        <>
          {ended && (
            <Typography sx={{ fontSize: 20, fontWeight: 700 }}>
              {ENDED_TEXT[ended] ?? "Your turn is over."}
            </Typography>
          )}
          {error && <Typography sx={{ color: "#fca5a5" }}>{error}</Typography>}

          {token ? (
            <>
              <Typography sx={{ opacity: 0.8 }}>
                Get in line to control the toy on the TV.
                {state?.queueLength > 0 &&
                  ` ${state.queueLength} waiting.`}
              </Typography>
              <TextField
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                inputProps={{ maxLength: 20 }}
                sx={{
                  width: "100%",
                  maxWidth: 320,
                  "& .MuiInputBase-root": {
                    color: "white",
                    background: "rgba(255,255,255,0.1)",
                  },
                }}
              />
              <Button
                variant="contained"
                size="large"
                onClick={join}
                disabled={!connected}
                sx={{ px: 5, py: 1.5, fontSize: 18, textTransform: "none" }}
              >
                Join the line
              </Button>
            </>
          ) : (
            <Typography sx={{ opacity: 0.8 }}>
              Scan the QR code on the TV to {ended ? "play again" : "join"}.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

// ─── Trackpad ────────────────────────────────────────────────────────────────

function Trackpad({ you, send, connected, look, onLookChange }) {
  const padRef = useRef(null);
  const lastRef = useRef(null);
  const pendingRef = useRef({ dx: 0, dy: 0 });
  const secondsLeft = useCountdown(you.endsAt);
  const [touching, setTouching] = useState(false);
  const [lookTab, setLookTab] = useState(null); // null = customize panel closed

  // Batch deltas and send at most once per animation frame.
  useEffect(() => {
    let raf;
    const flush = () => {
      const p = pendingRef.current;
      if (p.dx !== 0 || p.dy !== 0) {
        send({ type: "move", dx: p.dx, dy: p.dy });
        pendingRef.current = { dx: 0, dy: 0 };
      }
      raf = requestAnimationFrame(flush);
    };
    raf = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(raf);
  }, [send]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setTouching(true);
  };
  const onPointerMove = (e) => {
    const last = lastRef.current;
    if (!last || last.id !== e.pointerId) return;
    // Normalize by pad width so every phone moves the toy the same amount.
    const w = padRef.current?.clientWidth || 1;
    pendingRef.current.dx += (e.clientX - last.x) / w;
    pendingRef.current.dy += (e.clientY - last.y) / w;
    lastRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    if (lastRef.current?.id === e.pointerId) lastRef.current = null;
    setTouching(false);
  };

  return (
    <Box sx={{ ...shell, p: 2, gap: 2 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography sx={{ fontWeight: 700 }}>Your turn, {you.name}!</Typography>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: 22,
            fontVariantNumeric: "tabular-nums",
            color: secondsLeft <= 10 ? "#fca5a5" : "white",
          }}
        >
          {fmtSeconds(secondsLeft)}
        </Typography>
      </Box>

      <Box
        ref={padRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        sx={{
          flex: 1,
          borderRadius: 4,
          border: "2px solid rgba(255,255,255,0.25)",
          background: touching
            ? "rgba(255,255,255,0.14)"
            : "rgba(255,255,255,0.07)",
          touchAction: "none",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s",
        }}
      >
        <Typography sx={{ opacity: 0.45, pointerEvents: "none" }}>
          {connected ? "Drag here to move the toy 🐭" : "Reconnecting…"}
        </Typography>
      </Box>

      {lookTab && (
        <Box
          sx={{
            maxHeight: "45vh",
            overflowY: "auto",
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(0,0,0,0.35)",
          }}
        >
          <Tabs
            value={lookTab}
            onChange={(_, v) => setLookTab(v)}
            textColor="inherit"
            variant="fullWidth"
            sx={{
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              minHeight: 40,
              "& .MuiTab-root": {
                color: "rgba(255,255,255,0.6)",
                fontSize: 12,
                fontWeight: 600,
                minHeight: 40,
                py: 0,
              },
              "& .Mui-selected": { color: "white" },
              "& .MuiTabs-indicator": { backgroundColor: "white" },
            }}
          >
            <Tab label="⚙️ Tune" value="tune" />
            <Tab label="🎯 Cursor" value="cursor" />
            <Tab label="🖼 Scenes" value="bg" />
            <Tab label="🔊 Sound" value="sound" />
          </Tabs>
          <Box sx={{ p: 1.75 }}>
            <LookControls tab={lookTab} look={look} onChange={onLookChange} />
          </Box>
        </Box>
      )}

      {look.soundId !== "none" && look.soundMode === "button" && (
        <Button
          variant="contained"
          size="large"
          onClick={() => send({ type: "sound" })}
          sx={{ py: 1.5, fontSize: 18, textTransform: "none" }}
        >
          🔊 Play sound
        </Button>
      )}

      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => setLookTab((t) => (t ? null : "cursor"))}
          sx={{ flex: 1, textTransform: "none" }}
        >
          {lookTab ? "Done customizing" : "🎨 Customize"}
        </Button>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => send({ type: "leave" })}
          sx={{ flex: 1, textTransform: "none" }}
        >
          End my turn
        </Button>
      </Box>
    </Box>
  );
}
