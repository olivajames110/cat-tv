import { useState, useEffect, useRef, useCallback } from "react";
import Logo from "./assets/logo.png";
import {
  Box,
  Typography,
  Button,
  ButtonGroup,
  Tabs,
  Tab,
  Slider as MuiSlider,
  Paper,
} from "@mui/material";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import {
  AdsClickOutlined,
  PanToolAltOutlined,
  SmartToyOutlined,
} from "@mui/icons-material";

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKGROUNDS = [
  {
    id: "grass",
    label: "🌿 Garden",
    style: {
      background:
        "radial-gradient(ellipse at 60% 30%, #4ade80 0%, #16a34a 40%, #15803d 100%)",
    },
    accent: "#86efac",
  },
  {
    id: "night",
    label: "🌙 Night",
    style: {
      background:
        "radial-gradient(ellipse at 40% 20%, #1e1b4b 0%, #0f0a2e 50%, #000000 100%)",
    },
    accent: "#818cf8",
  },
  {
    id: "sunset",
    label: "🌅 Sunset",
    style: {
      background:
        "linear-gradient(180deg, #f97316 0%, #ec4899 40%, #7c3aed 100%)",
    },
    accent: "#fbbf24",
  },
  {
    id: "snow",
    label: "❄️ Winter",
    style: {
      background:
        "radial-gradient(ellipse at 50% 0%, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%)",
    },
    accent: "#0ea5e9",
  },
  {
    id: "desert",
    label: "🏜️ Desert",
    style: {
      background:
        "linear-gradient(180deg, #fbbf24 0%, #f59e0b 40%, #d97706 100%)",
    },
    accent: "#fef3c7",
  },
  {
    id: "ocean",
    label: "🌊 Ocean",
    style: {
      background:
        "radial-gradient(ellipse at 30% 10%, #0ea5e9 0%, #0284c7 40%, #075985 100%)",
    },
    accent: "#7dd3fc",
  },
];

const CURSORS = [
  { id: "mouse", label: "🐭 Mouse", emoji: "🐭", baseSize: 36 },
  { id: "bird", label: "🐦 Bird", emoji: "🐦", baseSize: 34 },
  { id: "fish", label: "🐟 Fish", emoji: "🐟", baseSize: 34 },
  { id: "bug", label: "🦋 Butterfly", emoji: "🦋", baseSize: 32 },
  { id: "laser", label: "🔴 Laser", emoji: "●", baseSize: 18, isLaser: true },
  { id: "yarn", label: "🧶 Yarn", emoji: "🧶", baseSize: 36 },
  { id: "feather", label: "🪶 Feather", emoji: "🪶", baseSize: 32 },
];

// ─── Rope Physics (Verlet) ────────────────────────────────────────────────────

const SEG_COUNT = 30;
const GRAVITY = 0.42;
const DAMPING = 0.984;
const ITERATIONS = 14;
// Friction when a node is resting on the floor — kills horizontal velocity
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
  const FLOOR = window.innerHeight - 4; // 4px above the very bottom edge

  const n = nodes.map((nd) => ({ ...nd }));

  // Pin head
  n[0].x = hx;
  n[0].y = hy;
  n[0].px = hx;
  n[0].py = hy;

  // Verlet integrate
  for (let i = 1; i < n.length; i++) {
    let vx = (n[i].x - n[i].px) * DAMPING;
    let vy = (n[i].y - n[i].py) * DAMPING;
    n[i].px = n[i].x;
    n[i].py = n[i].y;
    n[i].x += vx;
    n[i].y += vy + GRAVITY;

    // Floor collision — node rests on floor and loses horizontal momentum
    if (n[i].y >= FLOOR) {
      n[i].y = FLOOR;
      n[i].py = FLOOR + vy * FLOOR_FRICTION; // bleed out vertical bounce
      // Dampen horizontal sliding so it settles naturally
      n[i].x = n[i].px + vx * FLOOR_FRICTION;
    }
  }

  // Constraint iterations
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
      // Re-apply floor constraint after constraint solving too
      if (i > 0 && n[i].y > FLOOR) {
        n[i].y = FLOOR;
      }
      if (n[i + 1].y > FLOOR) {
        n[i + 1].y = FLOOR;
      }
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

// ─── Manual Toy ───────────────────────────────────────────────────────────────

function ManualToy({ cursorObj, toySize, trailWidth, trailLength }) {
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

  const segLen = 4 + trailLength * 0.22;
  const nodes = useRopePhysics(pos, segLen);
  const isLaser = cursorObj.isLaser;
  const fontSize = Math.round(cursorObj.baseSize * (toySize / 36));
  const sw = Math.max(1, trailWidth / 8);

  return (
    <>
      <RopeTrail nodes={nodes} strokeWidth={sw} isLaser={isLaser} />
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

function AutoToy({ cursorObj, toySize, trailWidth, trailLength, autoSpeed }) {
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
      // Read speed live from ref so slider changes take effect immediately
      const TOPSPEED = 1 + speedRef.current * 0.14; // range ~1.1 – 15
      const ACCEL = 0.05 + speedRef.current * 0.008;

      const p = posRef.current;
      const t = targetRef.current;
      const v = velRef.current;
      const dx = t.x - p.x;
      const dy = t.y - p.y;
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

  const segLen = 4 + trailLength * 0.22;
  const nodes = useRopePhysics(pos, segLen);
  const isLaser = cursorObj.isLaser;
  const fontSize = Math.round(cursorObj.baseSize * (toySize / 36));
  const sw = Math.max(1, trailWidth / 8);

  return (
    <>
      <RopeTrail nodes={nodes} strokeWidth={sw} isLaser={isLaser} />
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

// ─── BG Decorations ───────────────────────────────────────────────────────────

function BgDecorations({ bgId }) {
  const [data] = useState(() => ({
    stars: Array.from({ length: 60 }, () => ({
      left: Math.random() * 100,
      top: Math.random() * 70,
      w: Math.random() * 3 + 1,
      dur: 2 + Math.random() * 3,
      delay: Math.random() * 3,
    })),
    flakes: Array.from({ length: 40 }, () => ({
      left: Math.random() * 100,
      size: Math.random() * 14 + 8,
      dur: 5 + Math.random() * 8,
      delay: Math.random() * 8,
    })),
    blades: Array.from({ length: 30 }, (_, i) => ({
      left: (i / 30) * 100 + Math.random() * 3,
      h: 40 + Math.random() * 60,
      rot: (Math.random() - 0.5) * 20,
    })),
  }));

  if (bgId === "night")
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {data.stars.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.w,
              height: s.w,
              borderRadius: "50%",
              background: "white",
              opacity: 0.6,
              animation: `twinkle ${s.dur}s ease-in-out infinite`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>
    );

  if (bgId === "grass")
    return (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 120,
          pointerEvents: "none",
        }}
      >
        {data.blades.map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              bottom: 0,
              left: `${b.left}%`,
              width: 3,
              height: b.h,
              background: "#15803d",
              borderRadius: "2px 2px 0 0",
              transform: `rotate(${b.rot}deg)`,
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>
    );

  if (bgId === "snow")
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {data.flakes.map((f, i) => (
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

// ─── MUI Slider wrapper ───────────────────────────────────────────────────────

function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.8)" }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ color: "white", fontWeight: 700 }}>
          {fmt ? fmt(value) : value}
        </Typography>
      </Box>
      <MuiSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(_, v) => onChange(v)}
        size="small"
        sx={{
          color: "white",
          "& .MuiSlider-thumb": { width: 14, height: 14 },
          "& .MuiSlider-rail": { opacity: 0.3 },
        }}
      />
    </Box>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function CatEntertainmentApp() {
  const [bgId, setBgId] = useState("grass");
  const [cursorId, setCursorId] = useState("mouse");
  const [mode, setMode] = useState("manual");
  const [showPanel, setShowPanel] = useState(true);
  const [panelTab, setPanelTab] = useState("bg");
  const [toySize, setToySize] = useState(36); // 16–200
  const [trailWidth, setTrailWidth] = useState(24); // 4–64
  const [trailLength, setTrailLength] = useState(50); // 10–120
  const [autoSpeed, setAutoSpeed] = useState(40); // 1–100

  const bg = BACKGROUNDS.find((b) => b.id === bgId);
  const cursorObj = CURSORS.find((c) => c.id === cursorId);

  return (
    <div
      style={{
        ...bg.style,
        minHeight: "100vh",
        width: "100vw",
        position: "relative",
        overflow: "hidden",
        cursor: "none",
        fontFamily: "'Trebuchet MS', sans-serif",
      }}
    >
      <style>{`
        @keyframes twinkle {
          0%,100% { opacity:0.2; transform:scale(1); }
          50%     { opacity:1;   transform:scale(1.4); }
        }
        @keyframes snowfall {
          0%   { transform:translateY(-20px) rotate(0deg); }
          100% { transform:translateY(110vh) rotate(360deg); }
        }
        @keyframes panelSlide {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>

      <BgDecorations bgId={bgId} />

      {mode === "manual" ? (
        <ManualToy
          key="m"
          cursorObj={cursorObj}
          toySize={toySize}
          trailWidth={trailWidth}
          trailLength={trailLength}
        />
      ) : (
        <AutoToy
          key="a"
          cursorObj={cursorObj}
          toySize={toySize}
          trailWidth={trailWidth}
          trailLength={trailLength}
          autoSpeed={autoSpeed}
        />
      )}

      {/* ── Control Panel ── */}
      {showPanel && (
        <Paper
          elevation={8}
          sx={{
            position: "fixed",
            top: 20,
            right: 20,
            width: "max-content",
            // width: 420,
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
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <img src={Logo} alt="Cat TV" style={{ width: 80, height: 80 }} />
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  flex: 1,
                }}
              >
                <Typography
                  sx={{ fontWeight: 700, fontSize: 22, color: "white" }}
                >
                  Catpurrccino's Interactive
                </Typography>
                <ButtonGroup size="small" variant="outlined">
                  <Button
                    size="large"
                    startIcon={<AdsClickOutlined />}
                    onClick={() => setMode("manual")}
                    sx={{
                      color: "white",
                      //   fontSize: 12,
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
                    {/* 👆 Manual Mode */}
                  </Button>
                  <Button
                    startIcon={<SmartToyOutlined />}
                    size="large"
                    onClick={() => setMode("auto")}
                    sx={{
                      color: "white",
                      //   fontSize: 12,
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
                    {/* 🤖 Auto Move */}
                  </Button>
                </ButtonGroup>
              </Box>
            </Box>
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
            <Tab label="🖼 Scenes" value="bg" />
            <Tab label="🎯 Toys" value="toy" />
            <Tab label="⚙️ Tune" value="tune" />
          </Tabs>

          <Box sx={{ p: 1.75 }}>
            {/* Scenes */}
            {panelTab === "bg" && (
              <Box
                sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}
              >
                {BACKGROUNDS.map((b) => (
                  <Button
                    key={b.id}
                    onClick={() => setBgId(b.id)}
                    sx={{
                      ...b.style,
                      minHeight: 52,
                      color: "white",
                      fontSize: 12,
                      borderRadius: 2,
                      border:
                        bgId === b.id
                          ? "2px solid white"
                          : "2px solid rgba(255,255,255,0.2)",
                      boxShadow:
                        bgId === b.id
                          ? "0 0 10px rgba(255,255,255,0.3)"
                          : "none",
                      textTransform: "none",
                      "&:hover": { opacity: 0.85, transform: "scale(1.04)" },
                      transition: "all 0.2s",
                    }}
                  >
                    {b.label}
                  </Button>
                ))}
              </Box>
            )}

            {/* Toys */}
            {panelTab === "toy" && (
              <Box
                sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}
              >
                {CURSORS.map((c) => (
                  <Button
                    key={c.id}
                    onClick={() => setCursorId(c.id)}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.25,
                      color: "white",
                      fontSize: 11,
                      borderRadius: 2,
                      py: 1.25,
                      border:
                        cursorId === c.id
                          ? "2px solid white"
                          : "2px solid rgba(255,255,255,0.2)",
                      background:
                        cursorId === c.id
                          ? "rgba(255,255,255,0.3)"
                          : "rgba(255,255,255,0.08)",
                      boxShadow:
                        cursorId === c.id
                          ? "0 0 10px rgba(255,255,255,0.3)"
                          : "none",
                      textTransform: "none",
                      "&:hover": {
                        background: "rgba(255,255,255,0.2)",
                        transform: "scale(1.04)",
                      },
                      transition: "all 0.2s",
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{c.emoji}</span>
                    <span style={{ opacity: 0.8 }}>
                      {c.label.split(" ").slice(1).join(" ")}
                    </span>
                  </Button>
                ))}
              </Box>
            )}

            {/* Tune */}
            {panelTab === "tune" && (
              <Box>
                <Slider
                  label="Toy Size"
                  value={toySize}
                  min={16}
                  max={200}
                  step={4}
                  onChange={setToySize}
                  fmt={(v) => `${v}px`}
                />
                <Slider
                  label="String Thickness"
                  value={trailWidth}
                  min={4}
                  max={64}
                  step={2}
                  onChange={setTrailWidth}
                  fmt={(v) => `${v}pt`}
                />
                <Slider
                  label="String Length"
                  value={trailLength}
                  min={10}
                  max={120}
                  step={5}
                  onChange={setTrailLength}
                  fmt={(v) => (v < 40 ? "Short" : v < 85 ? "Medium" : "Long")}
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
                {mode !== "auto" && (
                  <Typography
                    variant="caption"
                    sx={{ opacity: 0.45, display: "block", mt: -1, mb: 1 }}
                  >
                    Switch to Auto Move to use speed
                  </Typography>
                )}
              </Box>
            )}
          </Box>

          <Typography
            sx={{
              pb: 1.5,
              opacity: 0.5,
              fontSize: 11,
              textAlign: "center",
              color: "white",
            }}
          >
            {mode === "manual"
              ? "Move cursor / finger to play"
              : "Toy roams freely — sit back!"}
          </Typography>
        </Paper>
      )}

      {/* Toggle button */}
      <Button
        onClick={() => setShowPanel((p) => !p)}
        startIcon={showPanel ? <VisibilityOffIcon /> : <VisibilityIcon />}
        sx={{
          position: "fixed",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          px: 3,
          py: 1.25,
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,255,255,0.3)",
          color: "white",
          borderRadius: 5,
          backdropFilter: "blur(10px)",
          fontSize: 14,
          textTransform: "none",
          zIndex: 10001,
          "&:hover": { background: "rgba(0,0,0,0.65)" },
        }}
      >
        {showPanel ? "Hide Controls" : "Show Controls"}
      </Button>
    </div>
  );
}
