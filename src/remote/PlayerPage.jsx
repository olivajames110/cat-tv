import { useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, TextField, Typography } from "@mui/material";
import useCatSocket, { fmtSeconds, useCountdown } from "./useCatSocket.js";
import useSharedLook from "./useSharedLook.js";
import LookControls from "../LookControls.jsx";
import { BACKGROUNDS, CURSORS, SOUNDS } from "../shared/look.js";
import { sceneThumbStyle } from "../scenes.js";
import Logo from "../assets/logo.png";

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
        queueLength={state?.queueLength ?? 0}
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
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
        }}
      >
        <img src={Logo} alt="" style={{ height: 96, width: "auto" }} />
        <Typography sx={{ fontSize: 28, fontWeight: 700 }}>
          Catpurrccino's TV
        </Typography>
      </Box>

      {status === "queued" && (
        <>
          <Typography sx={{ fontSize: 20 }}>
            You're in line, {you.name}!
          </Typography>
          <Typography sx={{ fontSize: 64, fontWeight: 700, lineHeight: 1 }}>
            #{you.position}
          </Typography>
          <Typography sx={{ opacity: 0.7 }}>
            {you.position === 1
              ? "You're up next."
              : `${you.position - 1} ahead of you.`}{" "}
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
                {state?.queueLength > 0 && ` ${state.queueLength} waiting.`}
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

// Labels are "<emoji> <name>"; the boxes show the two parts on separate lines.
function splitLabel(list, id) {
  const label = list.find((x) => x.id === id)?.label ?? "";
  const space = label.indexOf(" ");
  return { icon: label.slice(0, space), name: label.slice(space + 1) };
}

// Each box shows what's picked right now, under the setting's name.
function lookTabs(look) {
  return [
    { id: "tune", title: "Tune", icon: "⚙️", name: "Toy & string" },
    { id: "cursor", title: "Toy", ...splitLabel(CURSORS, look.cursorId) },
    { id: "bg", title: "Scene", ...splitLabel(BACKGROUNDS, look.bgId) },
    { id: "sound", title: "Sound", ...splitLabel(SOUNDS, look.soundId) },
  ];
}

function Trackpad({ you, send, connected, look, onLookChange, queueLength }) {
  const padRef = useRef(null);
  const lastRef = useRef(null);
  const pendingRef = useRef({ dx: 0, dy: 0 });
  const secondsLeft = useCountdown(you.endsAt);
  const [touching, setTouching] = useState(false);
  const [lookTab, setLookTab] = useState(null); // null = settings panel closed

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

  const soundReady = look.soundId !== "none" && look.soundMode === "button";
  const toggleTab = (tab) => setLookTab((t) => (t === tab ? null : tab));

  return (
    <Box sx={{ ...shell, p: 2, gap: 1.5 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
          {queueLength === 0 && you.canExtend && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={() => send({ type: "extend" })}
              sx={{ textTransform: "none", minWidth: 0, px: 1.25 }}
            >
              +1 min
            </Button>
          )}
        </Box>
        <Button
          size="small"
          variant="contained"
          color="error"
          onClick={() => send({ type: "leave" })}
          sx={{ textTransform: "none" }}
        >
          End my turn
        </Button>
      </Box>

      <Box
        ref={padRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        sx={{
          flex: 1,
          minHeight: 120,
          borderRadius: 4,
          border: "2px solid rgba(255,255,255,0.25)",
          background: touching
            ? "rgba(255,255,255,0.14)"
            : "rgba(255,255,255,0.07)",
          touchAction: "none",
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          transition: "background 0.15s",
        }}
      >
        <Typography sx={{ opacity: 0.45, pointerEvents: "none" }}>
          {connected
            ? `Your turn, ${you.name}! Drag here to move the toy 🐭`
            : "Reconnecting…"}
        </Typography>
      </Box>

      {lookTab && (
        <Box
          sx={{
            position: "relative",
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(0,0,0,0.35)",
          }}
        >
          {/* Outside the scrolling area so it stays put. */}
          <IconButton
            aria-label="Close"
            size="small"
            onClick={() => setLookTab(null)}
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              zIndex: 1,
              width: 28,
              height: 28,
              fontSize: 14,
              color: "white",
              background: "rgba(255,255,255,0.12)",
              "&:hover": { background: "rgba(255,255,255,0.22)" },
            }}
          >
            ✕
          </IconButton>
          <Box sx={{ maxHeight: "38vh", overflowY: "auto", p: 1.75, pt: 4.5 }}>
            <LookControls tab={lookTab} look={look} onChange={onLookChange} />
          </Box>
        </Box>
      )}

      {/* Hidden while a settings panel is open so it doesn't crowd the options. */}
      {!lookTab && soundReady && (
        <Button
          variant="contained"
          size="large"
          onClick={() => send({ type: "sound" })}
          sx={{ py: 1.5, fontSize: 18, textTransform: "none" }}
        >
          🔊 Play sound
        </Button>
      )}
      {!lookTab && !soundReady && (
        // Looks disabled, but tapping it opens the Sound settings to turn it on.
        <Button
          variant="outlined"
          size="large"
          onClick={() => setLookTab("sound")}
          sx={{
            py: 1,
            textTransform: "none",
            color: "rgba(255,255,255,0.5)",
            borderColor: "rgba(255,255,255,0.2)",
            borderStyle: "dashed",
            display: "flex",
            flexDirection: "column",
            lineHeight: 1.3,
          }}
        >
          <span style={{ fontSize: 18 }}>
            {look.soundId === "none"
              ? "🔇 Sound is off"
              : "🔁 Sound is on auto play"}
          </span>
          <span style={{ fontSize: 13, opacity: 0.8 }}>
            {look.soundId === "none"
              ? "Tap to pick a sound"
              : "Tap to switch to a Play sound button"}
          </span>
        </Button>
      )}

      <Box
        sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}
      >
        {lookTabs(look).map(({ id, title, icon, name }) => {
          const selected = lookTab === id;
          const isScene = id === "bg";
          return (
            <Button
              key={id}
              onClick={() => toggleTab(id)}
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.25,
                py: 1,
                px: 0.5,
                minWidth: 0,
                borderRadius: 2.5,
                textTransform: "none",
                color: "white",
                border: selected
                  ? "2px solid white"
                  : "1px solid rgba(255,255,255,0.2)",
                background: selected
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(255,255,255,0.07)",
                // The scene box shows the scene photo, dimmed behind the text.
                ...(isScene && {
                  background: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.6)), ${
                    sceneThumbStyle(look.bgId).background
                  }`,
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                }),
              }}
            >
              <span style={{ fontSize: 10, opacity: 0.75, letterSpacing: 0.5 }}>
                {title.toUpperCase()}
              </span>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </span>
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
