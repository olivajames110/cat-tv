import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import Logo from "./assets/logo.png";
import useCatSocket, { fmtSeconds, useCountdown } from "./remote/useCatSocket.js";
import useSharedLook from "./remote/useSharedLook.js";
import LookControls, { Slider } from "./LookControls.jsx";
import { BACKGROUNDS, CURSORS } from "./shared/look.js";
import { sceneStyle } from "./scenes.js";
import {
  Box,
  Typography,
  Button,
  ButtonGroup,
  Tabs,
  Tab,
  Paper,
  IconButton,
  Divider,
} from "@mui/material";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import {
  AdsClickOutlined,
  CloseRounded,
  SmartToyOutlined,
} from "@mui/icons-material";

// ─── Rope Physics (Verlet) ────────────────────────────────────────────────────

const SEG_COUNT = 30;
const GRAVITY = 0.42;
const DAMPING = 0.984;
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

function stepRope(nodes, hx, hy, segLen) {
  const FLOOR = window.innerHeight - 4;
  const n = nodes.map((nd) => ({ ...nd }));

  n[0].x = hx;
  n[0].y = hy;
  n[0].px = hx;
  n[0].py = hy;

  for (let i = 1; i < n.length; i++) {
    let vx = (n[i].x - n[i].px) * DAMPING;
    let vy = (n[i].y - n[i].py) * DAMPING;
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

function RopeTrail({ nodes, strokeWidth, isLaser }) {
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
            stroke="#c8961a"
            strokeWidth={sw + 1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={path}
            fill="none"
            stroke="#f5c842"
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
          <circle cx={tail.x} cy={tail.y} r={sw * 2} fill="#c8961a" />
          <circle cx={tail.x} cy={tail.y} r={sw * 1.5} fill="#f5c842" />
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

function useRopePhysics(headPos, segLen) {
  const ropeRef = useRef(null);
  const headRef = useRef(headPos);
  const segLenRef = useRef(segLen);
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
          segLenRef.current
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

function ToyView({
  pos,
  cursorObj,
  toySize,
  trailWidth,
  trailLength,
  showString,
}) {
  const segLen = 4 + trailLength * 0.22;
  const nodes = useRopePhysics(pos, segLen);
  const isLaser = cursorObj.isLaser;
  const fontSize = Math.round(cursorObj.baseSize * (toySize / 36));
  const sw = Math.max(1, trailWidth / 8);

  return (
    <>
      {showString && (
        <RopeTrail nodes={nodes} strokeWidth={sw} isLaser={isLaser} />
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

// ─── Manual Toy ───────────────────────────────────────────────────────────────

function ManualToy({
  cursorObj,
  toySize,
  trailWidth,
  trailLength,
  showString,
}) {
  const [pos, setPos] = useState({ x: -400, y: -400 });

  useEffect(() => {
    const onMove = (e) => {
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      if (x !== undefined) setPos({ x, y });
    };
    const onLeave = () => setPos({ x: -400, y: -400 });
    const onEnter = (e) => setPos({ x: e.clientX, y: e.clientY });

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
    };
  }, []);

  return (
    <ToyView
      pos={pos}
      cursorObj={cursorObj}
      toySize={toySize}
      trailWidth={trailWidth}
      trailLength={trailLength}
      showString={showString}
    />
  );
}

// ─── Auto Toy ─────────────────────────────────────────────────────────────────

function AutoToy({
  cursorObj,
  toySize,
  trailWidth,
  trailLength,
  autoSpeed,
  showString,
}) {
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

  return (
    <ToyView
      pos={pos}
      cursorObj={cursorObj}
      toySize={toySize}
      trailWidth={trailWidth}
      trailLength={trailLength}
      showString={showString}
    />
  );
}

// ─── Remote Toy (driven from a phone) ─────────────────────────────────────────

// A swipe across the full width of the phone moves the toy this many TV widths.
const REMOTE_GAIN = 1.2;

function RemoteToy({
  deltaRef,
  cursorObj,
  toySize,
  trailWidth,
  trailLength,
  showString,
}) {
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  }));
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
        setPos(posRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [deltaRef]);

  return (
    <ToyView
      pos={pos}
      cursorObj={cursorObj}
      toySize={toySize}
      trailWidth={trailWidth}
      trailLength={trailLength}
      showString={showString}
    />
  );
}

// ─── Join QR panel ────────────────────────────────────────────────────────────

function joinUrlFor(state) {
  const base = state.publicUrl
    ? new URL(state.publicUrl)
    : new URL(window.location.origin);
  // "localhost" on the TV means nothing to a phone; swap in the LAN address.
  if (
    !state.publicUrl &&
    state.lanHost &&
    ["localhost", "127.0.0.1", "::1"].includes(base.hostname)
  ) {
    base.hostname = state.lanHost;
  }
  base.pathname = "/play";
  base.search = `?t=${state.joinToken}`;
  return base.toString();
}

function JoinPanel({ state }) {
  const joinUrl = state?.joinToken ? joinUrlFor(state) : null;
  const [qr, setQr] = useState(null);
  const secondsLeft = useCountdown(state?.active?.endsAt);

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360 }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  if (!joinUrl || !qr) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: "fixed",
        left: 20,
        bottom: 20,
        p: 1.5,
        width: 200,
        background: "rgba(0,0,0,0.58)",
        backdropFilter: "blur(20px)",
        borderRadius: 3,
        border: "1px solid rgba(255,255,255,0.15)",
        color: "white",
        zIndex: 10000,
        textAlign: "center",
      }}
    >
      <img
        src={qr}
        alt="Scan to play"
        style={{ width: "100%", borderRadius: 8, display: "block" }}
      />
      <Typography sx={{ fontWeight: 700, mt: 1, color: "white" }}>
        📱 Scan to play!
      </Typography>
      {state.active ? (
        <Typography sx={{ fontSize: 13, color: "white", opacity: 0.85 }}>
          {state.active.name} is playing · {fmtSeconds(secondsLeft)}
        </Typography>
      ) : (
        <Typography sx={{ fontSize: 13, color: "white", opacity: 0.85 }}>
          Nobody's playing — you're next!
        </Typography>
      )}
      {state.queueLength > 0 && (
        <Typography sx={{ fontSize: 12, color: "white", opacity: 0.6 }}>
          {state.queueLength} in line
          {state.upNext.length > 0 && `: ${state.upNext.join(", ")}`}
        </Typography>
      )}
    </Paper>
  );
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

export default function CatEntertainmentApp() {
  const [mode, setMode] = useState("manual");
  const [showPanel, setShowPanel] = useState(false);
  const [panelTab, setPanelTab] = useState("tune");
  const [autoSpeed, setAutoSpeed] = useState(40);

  // ── Phone remote: move deltas accumulate here until RemoteToy consumes them.
  // The look (scene, cursor, sizes) is shared with the active phone.
  const remoteDeltaRef = useRef({ dx: 0, dy: 0 });
  const { look, editLook, onState: onLookState } = useSharedLook();
  const { state: remoteState, send } = useCatSocket(
    { role: "display" },
    (msg) => {
      if (msg.type === "move") {
        remoteDeltaRef.current.dx += msg.dx;
        remoteDeltaRef.current.dy += msg.dy;
      } else if (msg.type === "state") {
        onLookState(msg);
      }
    }
  );
  const updateLook = (patch) => {
    editLook(patch);
    send({ type: "look", patch });
  };
  const remoteActive = !!remoteState?.active;

  const { bgId, toySize, trailWidth, trailLength, showString } = look;
  const bg = BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[0];
  const cursorObj = CURSORS.find((c) => c.id === look.cursorId) ?? CURSORS[0];

  // ── Prevent mobile scroll/bounce ──────────────────────────────────────────
  // Only block touchmove on the game background — NOT touchstart.
  // Blocking touchstart breaks all button taps. Blocking touchmove on non-panel
  // elements is enough to stop the page/background from scrolling or bouncing.
  useEffect(() => {
    const preventMove = (e) => {
      if (e.target.closest(".cat-panel")) return; // let panel scroll freely
      e.preventDefault();
    };
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
        cursor: !showPanel && mode === "manual" ? "none" : "default",
        fontFamily: "'Trebuchet MS', sans-serif",
        touchAction: "none",
      }}
    >
      <style>{`
        @keyframes snowfall {
          0%   { transform:translateY(-20px) rotate(0deg); }
          100% { transform:translateY(110vh) rotate(360deg); }
        }
        @keyframes panelSlide {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        html, body {
          overflow: hidden;
          overscroll-behavior: none;
          position: fixed;
          width: 100%;
          height: 100%;
        }
        /* Panel and all its children get normal touch-action so taps work */
        .cat-panel, .cat-panel * {
          touch-action: auto;
        }
      `}</style>

      <BgDecorations bgId={bgId} />

      {remoteActive ? (
        <RemoteToy
          key="r"
          deltaRef={remoteDeltaRef}
          cursorObj={cursorObj}
          toySize={toySize}
          trailWidth={trailWidth}
          trailLength={trailLength}
          showString={showString}
        />
      ) : mode === "manual" ? (
        <ManualToy
          key="m"
          cursorObj={cursorObj}
          toySize={toySize}
          trailWidth={trailWidth}
          trailLength={trailLength}
          showString={showString}
        />
      ) : (
        <AutoToy
          key="a"
          cursorObj={cursorObj}
          toySize={toySize}
          trailWidth={trailWidth}
          trailLength={trailLength}
          autoSpeed={autoSpeed}
          showString={showString}
        />
      )}

      <JoinPanel state={remoteState} />

      {/* ── Control Panel ── */}
      {showPanel && (
        <Paper
          elevation={8}
          className="cat-panel"
          sx={{
            position: "fixed",
            top: 20,
            right: 20,
            width: { xs: "calc(100vw - 40px)", sm: "max-content" },
            maxHeight: "calc(100vh - 100px)",
            overflowY: "auto",
            touchAction: "pan-y", // allow vertical scroll inside panel
            background: "rgba(0,0,0,0.58)",
            backdropFilter: "blur(20px)",
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.15)",
            color: "white",
            zIndex: 10000,
            animation: "panelSlide 0.3s ease",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: "14px 16px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: { xs: "center", sm: "center" },
                gap: 1.5,
                textAlign: { xs: "center", sm: "left" },
              }}
            >
              <img src={Logo} alt="Cat TV" style={{ width: 81, height: 81 }} />

              <IconButton
                sx={{
                  color: "#ffffff",
                  position: "absolute",
                  top: 0,
                  right: 0,
                }}
                onClick={() => setShowPanel((p) => !p)}
              >
                <CloseRounded />
              </IconButton>

              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  flex: 1,
                  alignItems: { xs: "center", sm: "flex-start" },
                }}
              >
                <Typography
                  sx={{ fontWeight: 700, fontSize: 20, color: "white" }}
                >
                  Catpurrccino's Interactive
                </Typography>

                <ButtonGroup size="small" variant="outlined">
                  <Button
                    size="medium"
                    startIcon={<AdsClickOutlined />}
                    onClick={() => setMode("manual")}
                    sx={{
                      color: "white",
                      py: 1,
                      px: 2.5,
                      borderColor: "rgba(255,255,255,0.3)",
                      background:
                        mode === "manual"
                          ? "rgba(255,255,255,0.3)"
                          : "rgba(255,255,255,0.1)",
                      textTransform: "none",
                      "&:hover": {
                        background: "rgba(255,255,255,0.25)",
                        borderColor: "rgba(255,255,255,0.5)",
                      },
                    }}
                  >
                    Manual Mode
                  </Button>
                  <Button
                    size="medium"
                    startIcon={<SmartToyOutlined />}
                    onClick={() => setMode("auto")}
                    sx={{
                      color: "white",
                      py: 1,
                      px: 2.5,
                      borderColor: "rgba(255,255,255,0.3)",
                      background:
                        mode === "auto"
                          ? "rgba(255,255,255,0.3)"
                          : "rgba(255,255,255,0.1)",
                      textTransform: "none",
                      "&:hover": {
                        background: "rgba(255,255,255,0.25)",
                        borderColor: "rgba(255,255,255,0.5)",
                      },
                    }}
                  >
                    Auto Move
                  </Button>
                </ButtonGroup>
              </Box>
            </Box>

            <Typography
              sx={{
                opacity: 0.5,
                mt: 1.5,
                fontSize: 13,
                color: "white",
                textAlign: { xs: "center", sm: "left" },
              }}
            >
              {mode === "manual"
                ? "Move your cursor to play!"
                : "Toy roams freely — sit back!"}
            </Typography>
          </Box>

          {/* Tabs */}
          <Tabs
            value={panelTab}
            onChange={(_, v) => setPanelTab(v)}
            textColor="inherit"
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
          </Tabs>

          <Box sx={{ p: 1.75 }}>
            <LookControls
              tab={panelTab}
              look={look}
              onChange={updateLook}
              tuneExtra={
                mode === "auto" && (
                  <>
                    <Divider
                      sx={{ borderColor: "rgba(255,255,255,0.1)", my: 2 }}
                    />
                    <Slider
                      label="Auto Speed"
                      value={autoSpeed}
                      min={1}
                      max={100}
                      step={1}
                      onChange={setAutoSpeed}
                      fmt={(v) =>
                        v < 25
                          ? "🐢 Lazy"
                          : v < 55
                          ? "🐱 Normal"
                          : v < 80
                          ? "🐇 Zippy"
                          : "⚡ Frenzy"
                      }
                    />
                  </>
                )
              }
            />
          </Box>
        </Paper>
      )}

      {/* Toggle button (+ Auto Move indicator while the panel is hidden) */}
      <Box
        sx={{
          position: "fixed",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 1,
          zIndex: 10001,
        }}
      >
        <Button
          onClick={() => setShowPanel((p) => !p)}
          startIcon={showPanel ? <VisibilityOffIcon /> : <VisibilityIcon />}
          sx={{
            px: 3,
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
          {showPanel ? "Hide Controls" : "Show Controls"}
        </Button>

        {!showPanel && mode === "auto" && !remoteActive && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 2,
              py: 1.25,
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.3)",
              color: "white",
              borderRadius: 5,
              backdropFilter: "blur(10px)",
              fontSize: 14,
              lineHeight: 1.75,
              whiteSpace: "nowrap",
              animation: "panelSlide 0.3s ease",
            }}
          >
            <SmartToyOutlined sx={{ fontSize: 18 }} />
            Auto Move on
          </Box>
        )}
      </Box>
    </div>
  );
}
