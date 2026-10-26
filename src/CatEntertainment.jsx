import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import useCatSocket from "./remote/useCatSocket.js";
import useSharedLook from "./remote/useSharedLook.js";
import TvOverlay from "./TvOverlay.jsx";
import { BACKGROUNDS, CURSORS, SOUNDS, STRING_COLORS } from "./shared/look.js";
import { sceneStyle } from "./scenes.js";
import {
  audioRunning,
  playSound,
  subscribeAudioState,
  unlockAudio,
} from "./sounds.js";
import { Box, Button } from "@mui/material";

// ─── Rope Physics (Verlet) ────────────────────────────────────────────────────

const SEG_COUNT = 30;
const GRAVITY = 0.42;
const ITERATIONS = 14;
const FLOOR_FRICTION = 0.55;

function makeRope(x, y, segLen) {
  return Array.from({ length: SEG_COUNT }, (_, i) => ({
    x,
    y: y + i * segLen,
    px: x,
    py: y + i * segLen,
  }));
}

// Bounciness 0–100 maps to how much swing the string keeps each frame.
const dampingFor = (bounciness) => 0.95 + (bounciness / 100) * 0.046;

function stepRope(nodes, hx, hy, segLen, damping) {
  const FLOOR = window.innerHeight - 4;
  const n = nodes.map((nd) => ({ ...nd }));

  n[0].x = hx;
  n[0].y = hy;
  n[0].px = hx;
  n[0].py = hy;

  for (let i = 1; i < n.length; i++) {
    let vx = (n[i].x - n[i].px) * damping;
    let vy = (n[i].y - n[i].py) * damping;
    n[i].px = n[i].x;
    n[i].py = n[i].y;
    n[i].x += vx;
    n[i].y += vy + GRAVITY;

    if (n[i].y >= FLOOR) {
      n[i].y = FLOOR;
      n[i].py = FLOOR + vy * FLOOR_FRICTION;
      n[i].x = n[i].px + vx * FLOOR_FRICTION;
    }
  }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < n.length - 1; i++) {
      const dx = n[i + 1].x - n[i].x;
      const dy = n[i + 1].y - n[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const diff = ((dist - segLen) / dist) * 0.5;
      if (i === 0) {
        n[i + 1].x -= dx * diff * 2;
        n[i + 1].y -= dy * diff * 2;
      } else {
        n[i].x += dx * diff;
        n[i].y += dy * diff;
        n[i + 1].x -= dx * diff;
        n[i + 1].y -= dy * diff;
      }
      if (i > 0 && n[i].y > FLOOR) n[i].y = FLOOR;
      if (n[i + 1].y > FLOOR) n[i + 1].y = FLOOR;
    }
  }

  return n;
}

function ropeToPath(nodes) {
  if (nodes.length < 2) return "";
  let d = `M ${nodes[0].x.toFixed(2)} ${nodes[0].y.toFixed(2)}`;
  for (let i = 1; i < nodes.length - 1; i++) {
    const mx = ((nodes[i].x + nodes[i + 1].x) / 2).toFixed(2);
    const my = ((nodes[i].y + nodes[i + 1].y) / 2).toFixed(2);
    d += ` Q ${nodes[i].x.toFixed(2)} ${nodes[i].y.toFixed(2)} ${mx} ${my}`;
  }
  const l = nodes[nodes.length - 1];
  d += ` L ${l.x.toFixed(2)} ${l.y.toFixed(2)}`;
  return d;
}

// ─── Rope Renderer ────────────────────────────────────────────────────────────

function RopeTrail({ nodes, strokeWidth, isLaser, color }) {
  if (nodes.length < 2) return null;
  const path = ropeToPath(nodes);
  const tail = nodes[nodes.length - 1];
  const sw = Math.max(1, strokeWidth);

  return (
    <svg
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 9998,
      }}
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="laserGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {isLaser ? (
        <>
          <path
            d={path}
            fill="none"
            stroke="rgba(255,80,80,0.35)"
            strokeWidth={sw * 3.5}
            strokeLinecap="round"
            filter="url(#laserGlow)"
          />
          <path
            d={path}
            fill="none"
            stroke="rgba(255,30,30,0.95)"
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <path
            d={path}
            fill="none"
            stroke="rgba(255,200,200,0.8)"
            strokeWidth={sw * 0.3}
            strokeLinecap="round"
          />
          <circle
            cx={tail.x}
            cy={tail.y}
            r={sw * 2}
            fill="red"
            filter="url(#laserGlow)"
            opacity={0.9}
          />
        </>
      ) : (
        <>
          <path
            d={path}
            fill="none"
            stroke="rgba(0,0,0,0.3)"
            strokeWidth={sw + 3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={path}
            fill="none"
            stroke={color.edge}
            strokeWidth={sw + 1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={path}
            fill="none"
            stroke={color.main}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={path}
            fill="none"
            stroke="rgba(255,255,200,0.45)"
            strokeWidth={Math.max(0.5, sw * 0.3)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={tail.x} cy={tail.y} r={sw * 2} fill={color.edge} />
          <circle cx={tail.x} cy={tail.y} r={sw * 1.5} fill={color.main} />
          <circle
            cx={tail.x - sw * 0.4}
            cy={tail.y - sw * 0.4}
            r={sw * 0.5}
            fill="rgba(255,255,200,0.6)"
          />
        </>
      )}
    </svg>
  );
}

// ─── Shared rope physics hook ─────────────────────────────────────────────────

function useRopePhysics(headPos, segLen, damping) {
  const ropeRef = useRef(null);
  const headRef = useRef(headPos);
  const segLenRef = useRef(segLen);
  const dampingRef = useRef(damping);
  useEffect(() => {
    dampingRef.current = damping;
  }, [damping]);
  const [nodes, setNodes] = useState([]);

  useEffect(() => {
    ropeRef.current = makeRope(headPos.x, headPos.y, segLen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    headRef.current = headPos;
  }, [headPos]);
  useEffect(() => {
    segLenRef.current = segLen;
  }, [segLen]);

  const prevSegLen = useRef(segLen);
  useEffect(() => {
    if (Math.abs(segLen - prevSegLen.current) > 4 && ropeRef.current) {
      ropeRef.current = makeRope(headPos.x, headPos.y, segLen);
    }
    prevSegLen.current = segLen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segLen]);

  useEffect(() => {
    let raf;
    const loop = () => {
      if (ropeRef.current) {
        const h = headRef.current;
        ropeRef.current = stepRope(
          ropeRef.current,
          h.x,
          h.y,
          segLenRef.current,
          dampingRef.current
        );
        setNodes([...ropeRef.current]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return nodes;
}

// ─── Toy View (sprite + string) ───────────────────────────────────────────────

// `ping` ({ n, label }) changes each time a sound plays; rings expand from the toy.
function ToyView({ pos, look, ping }) {
  const { toySize, trailWidth, trailLength, showString } = look;
  const cursorObj = CURSORS.find((c) => c.id === look.cursorId) ?? CURSORS[0];
  const color =
    STRING_COLORS.find((c) => c.id === look.stringColor) ?? STRING_COLORS[1];
  const segLen = 4 + trailLength * 0.22;
  const nodes = useRopePhysics(pos, segLen, dampingFor(look.bounciness));
  const isLaser = cursorObj.isLaser;
  const fontSize = Math.round(cursorObj.baseSize * (toySize / 36));
  const sw = Math.max(1, trailWidth / 8);

  return (
    <>
      {showString && (
        <RopeTrail
          nodes={nodes}
          strokeWidth={sw}
          isLaser={isLaser}
          color={color}
        />
      )}
      {ping && (
        <div
          key={ping.n}
          className="sound-ping"
          style={{ left: pos.x, top: pos.y }}
        >
          <i />
          <i />
          <b>{ping.label}</b>
        </div>
      )}
      <div
        style={{
          position: "fixed",
          left: pos.x - fontSize / 2,
          top: pos.y - fontSize / 2,
          fontSize,
          pointerEvents: "none",
          zIndex: 9999,
          userSelect: "none",
          lineHeight: 1,
          filter: isLaser
            ? "drop-shadow(0 0 10px red) drop-shadow(0 0 22px rgba(255,0,0,0.5))"
            : "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
          color: isLaser ? "red" : undefined,
        }}
      >
        {cursorObj.emoji}
      </div>
    </>
  );
}

// ─── Auto Toy ─────────────────────────────────────────────────────────────────

function AutoToy({ look, ping, autoSpeed }) {
  const velRef = useRef({ vx: 3, vy: 2 });
  const posRef = useRef({ x: 400, y: 300 });
  const targetRef = useRef({ x: 500, y: 300 });
  const speedRef = useRef(autoSpeed);
  const [pos, setPos] = useState({ x: 400, y: 300 });

  useEffect(() => {
    speedRef.current = autoSpeed;
  }, [autoSpeed]);

  const pickTarget = useCallback(() => {
    const m = 120;
    targetRef.current = {
      x: m + Math.random() * (window.innerWidth - m * 2),
      y: m + Math.random() * (window.innerHeight - m * 2),
    };
  }, []);

  useEffect(() => {
    pickTarget();
    const iv = setInterval(pickTarget, 1600 + Math.random() * 2000);
    return () => clearInterval(iv);
  }, [pickTarget]);

  useEffect(() => {
    const MARGIN = 60;
    let raf;
    const loop = () => {
      const TOPSPEED = 1 + speedRef.current * 0.14;
      const ACCEL = 0.05 + speedRef.current * 0.008;
      const p = posRef.current,
        t = targetRef.current,
        v = velRef.current;
      const dx = t.x - p.x,
        dy = t.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      v.vx += (dx / dist) * ACCEL;
      v.vy += (dy / dist) * ACCEL;
      const spd = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      if (spd > TOPSPEED) {
        v.vx = (v.vx / spd) * TOPSPEED;
        v.vy = (v.vy / spd) * TOPSPEED;
      }
      posRef.current = {
        x: Math.max(MARGIN, Math.min(window.innerWidth - MARGIN, p.x + v.vx)),
        y: Math.max(MARGIN, Math.min(window.innerHeight - MARGIN, p.y + v.vy)),
      };
      setPos({ ...posRef.current });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <ToyView pos={pos} look={look} ping={ping} />;
}

// ─── Idle Toy ─────────────────────────────────────────────────────────────────

// Where the toy was last drawn, so a phone takes over without a jump.
let lastToyPos = null;

// Bobs gently in the gap between the TV's invitation text and the QR panel.
function IdleToy({ look, ping }) {
  const [pos, setPos] = useState(() => idlePos(0));

  useEffect(() => {
    let raf;
    const loop = (t) => {
      const p = idlePos(t);
      lastToyPos = p;
      setPos(p);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <ToyView pos={pos} look={look} ping={ping} />;
}

function idlePos(t) {
  return {
    x: window.innerWidth * 0.63,
    y: window.innerHeight * 0.42 + Math.sin(t / 700) * 18,
  };
}

// ─── Remote Toy (driven from a phone) ─────────────────────────────────────────

// A swipe across the full width of the phone moves the toy this many TV widths.
const REMOTE_GAIN = 1.2;

// Starts wherever the toy last was so it never jumps.
function RemoteToy({ deltaRef, look, ping }) {
  const [pos, setPos] = useState(
    () => lastToyPos ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  );
  const posRef = useRef(pos);

  useEffect(() => {
    deltaRef.current = { dx: 0, dy: 0 };
    let raf;
    const loop = () => {
      const d = deltaRef.current;
      if (d.dx !== 0 || d.dy !== 0) {
        const W = window.innerWidth;
        const p = posRef.current;
        posRef.current = {
          x: Math.max(0, Math.min(W, p.x + d.dx * W * REMOTE_GAIN)),
          y: Math.max(
            0,
            Math.min(window.innerHeight, p.y + d.dy * W * REMOTE_GAIN)
          ),
        };
        deltaRef.current = { dx: 0, dy: 0 };
        lastToyPos = posRef.current;
        setPos(posRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [deltaRef]);

  return <ToyView pos={pos} look={look} ping={ping} />;
}

// ─── BG Decorations ───────────────────────────────────────────────────────────

// Falling snow over the Winter photo.
function BgDecorations({ bgId }) {
  const [flakes] = useState(() =>
    Array.from({ length: 40 }, () => ({
      left: Math.random() * 100,
      size: Math.random() * 14 + 8,
      dur: 5 + Math.random() * 8,
      delay: Math.random() * 8,
    }))
  );

  if (bgId === "winter")
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {flakes.map((f, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${f.left}%`,
              top: -20,
              fontSize: f.size,
              opacity: 0.7,
              animation: `snowfall ${f.dur}s linear infinite`,
              animationDelay: `${f.delay}s`,
            }}
          >
            ❄
          </div>
        ))}
      </div>
    );

  return null;
}

// ─── Main App ─────────────────────────────────────────────────────────────────

// The TV only shows the toy: a phone drives it during a turn. Otherwise it
// bobs beside the QR panel, or roams on its own if the admin turned on auto
// move. The mouse doesn't control anything.
const AUTO_SPEED = 40;

export default function CatEntertainmentApp() {
  // ── Phone remote: move deltas accumulate here until RemoteToy consumes them.
  // The look (scene, cursor, sizes) is shared with the active phone.
  const remoteDeltaRef = useRef({ dx: 0, dy: 0 });
  const { look, onState: onLookState } = useSharedLook();

  // Short messages at the bottom of the TV so the room can follow along.
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = (text) => {
    setToast({ text, show: true });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(
      () => setToast((t) => ({ ...t, show: false })),
      2500
    );
  };

  // Plays a sound and shows rings around the toy with its name.
  const [ping, setPing] = useState(null);
  const playWithPing = (id, vol) => {
    if (id === "none") return;
    playSound(id, vol);
    const label = SOUNDS.find((x) => x.id === id)?.label ?? "";
    setPing((p) => ({
      n: (p?.n ?? 0) + 1,
      label: `${label.slice(label.indexOf(" ") + 1).toLowerCase()}!`,
    }));
  };

  const { state: remoteState } = useCatSocket({ role: "display" }, (msg) => {
    if (msg.type === "move") {
      remoteDeltaRef.current.dx += msg.dx;
      remoteDeltaRef.current.dy += msg.dy;
    } else if (msg.type === "state") {
      onLookState(msg);
    } else if (msg.type === "sound") {
      playWithPing(look.soundId, look.volume);
    } else if (msg.type === "event") {
      const text = {
        joined: `${msg.name} joined the line 👋`,
        turn: `${msg.name}'s turn — go get it! 🐾`,
        extended: `${msg.name} added more time ⏱️`,
        preset: `${msg.name} switched to ${msg.preset}`,
      }[msg.kind];
      if (text) showToast(text);
    }
  });
  const remoteActive = !!remoteState?.active;

  const { bgId } = look;
  const bg = BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[0];

  // ── Sound ─────────────────────────────────────────────────────────────────
  // Browsers block audio until the page is clicked once; any click unlocks it.
  const { soundId, soundMode, volume } = look;
  const audioOn = useSyncExternalStore(subscribeAudioState, audioRunning);
  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Play the newly picked sound once so whoever picked it hears it.
  useEffect(() => {
    playSound(soundId, volumeRef.current);
  }, [soundId]);

  // Auto play: one burst every few seconds.
  const playWithPingRef = useRef(playWithPing);
  useEffect(() => {
    playWithPingRef.current = playWithPing;
  });
  useEffect(() => {
    if (soundMode !== "auto" || soundId === "none") return;
    let timer;
    const schedule = () => {
      timer = setTimeout(
        () => {
          playWithPingRef.current(soundId, volumeRef.current);
          schedule();
        },
        2500 + Math.random() * 4500
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [soundId, soundMode]);

  // ── Prevent mobile scroll/bounce ──────────────────────────────────────────
  // Only block touchmove — blocking touchstart would break button taps.
  useEffect(() => {
    const preventMove = (e) => e.preventDefault();
    document.addEventListener("touchmove", preventMove, { passive: false });
    return () => document.removeEventListener("touchmove", preventMove);
  }, []);

  return (
    <div
      style={{
        ...sceneStyle(bg.id),
        minHeight: "100vh",
        width: "100vw",
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        fontFamily: "'Trebuchet MS', sans-serif",
        touchAction: "none",
      }}
    >
      <style>{`
        @keyframes snowfall {
          0%   { transform:translateY(-20px) rotate(0deg); }
          100% { transform:translateY(110vh) rotate(360deg); }
        }
        html, body {
          overflow: hidden;
          overscroll-behavior: none;
          position: fixed;
          width: 100%;
          height: 100%;
        }
      `}</style>

      <BgDecorations bgId={bgId} />

      {/* During a turn the phone drives the toy; otherwise it roams (auto
          move) or bobs beside the QR panel. */}
      {remoteActive ? (
        <RemoteToy key="r" deltaRef={remoteDeltaRef} look={look} ping={ping} />
      ) : remoteState?.autoMove ? (
        <AutoToy key="a" look={look} ping={ping} autoSpeed={AUTO_SPEED} />
      ) : (
        <IdleToy key="i" look={look} ping={ping} />
      )}

      <TvOverlay state={remoteState} toast={toast} />

      {/* Browsers keep audio muted until the page is clicked once. */}
      <Box
        sx={{
          position: "fixed",
          bottom: 20,
          left: 20,
          zIndex: 10001,
        }}
      >
        {soundId !== "none" && !audioOn && (
          <Button
            onClick={unlockAudio}
            sx={{
              px: 2,
              py: 1.25,
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.3)",
              color: "white",
              borderRadius: 5,
              backdropFilter: "blur(10px)",
              fontSize: 14,
              textTransform: "none",
              whiteSpace: "nowrap",
              "&:hover": { background: "rgba(0,0,0,0.65)" },
            }}
          >
            🔇 Click to enable sound
          </Button>
        )}
      </Box>
    </div>
  );
}
