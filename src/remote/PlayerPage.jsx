import { useEffect, useRef, useState } from "react";
import useCatSocket, { fmtSeconds, useCountdown } from "./useCatSocket.js";
import useSharedLook from "./useSharedLook.js";
import {
  BACKGROUNDS,
  CURSORS,
  LOOK_RANGES,
  PRESETS,
  SOUNDS,
  STRING_COLORS,
  matchingPreset,
} from "../shared/look.js";
import { sceneThumbStyle } from "../scenes.js";
import { playSound, unlockAudio } from "../sounds.js";
import Logo from "../assets/logo.png";
import "./player.css";

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

function loadStored(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
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
  skipped: "Your turn was ended by the admin.",
  kicked: "You were removed from the line.",
  disconnected: "You lost your spot after disconnecting.",
};

// Labels are "<emoji> <name>".
const emojiOf = (label) => label.slice(0, label.indexOf(" "));
const nameOf = (label) => label.slice(label.indexOf(" ") + 1);
const soundById = (id) => SOUNDS.find((s) => s.id === id) ?? SOUNDS[0];
const cursorById = (id) => CURSORS.find((c) => c.id === id) ?? CURSORS[0];
const colorById = (id) =>
  STRING_COLORS.find((c) => c.id === id) ?? STRING_COLORS[1];

// 150 → "2 minutes, 30 seconds", 60 → "1 minute".
function readDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const unit = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [m && unit(m, "minute"), s && unit(s, "second")]
    .filter(Boolean)
    .join(", ");
}

function fmtWait(seconds) {
  if (seconds < 60) return `${Math.max(5, Math.round(seconds / 5) * 5)} sec`;
  return `${Math.round(seconds / 60)} min`;
}

// Rough wait: what's left of the current turn plus a full turn per person ahead.
function waitSeconds(state, ahead) {
  const activeLeft = state?.active
    ? Math.max(0, (state.active.endsAt - Date.now()) / 1000)
    : 0;
  return activeLeft + ahead * (state?.maxSessionSeconds ?? 0);
}

function Brand() {
  return (
    <div className="pad-x">
      <div className="brand">
        <img src={Logo} alt="" />
        Catpurrccino's TV
      </div>
    </div>
  );
}

export default function PlayerPage() {
  const [clientId] = useState(getClientId);
  const [token, setToken] = useState(takeTokenFromUrl);
  const [name, setName] = useState(() => loadStored("catTvName", ""));
  const [ended, setEnded] = useState(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  // Preset picked while waiting; applied the moment the turn starts.
  const [pendingPreset, setPendingPreset] = useState(() =>
    loadStored("catTvPreset", null)
  );
  const turnRef = useRef(null); // { startedAt, sounds } during a turn
  const sendRef = useRef(null); // `send`, for use inside the socket callback

  const { look, editLook, onState: onLookState } = useSharedLook();
  const { connected, state, send } = useCatSocket(
    { role: "player", clientId },
    (msg) => {
      if (msg.type === "state") {
        onLookState(msg);
      } else if (msg.type === "ended") {
        const turn = turnRef.current;
        setStats(
          turn
            ? {
                seconds: Math.round((Date.now() - turn.startedAt) / 1000),
                sounds: turn.sounds,
              }
            : null
        );
        turnRef.current = null;
        setEnded(msg.reason);
        setToken(null);
      } else if (msg.type === "yourTurn") {
        navigator.vibrate?.([120, 60, 120]);
        turnRef.current = { startedAt: Date.now(), sounds: 0 };
        const preset = PRESETS.find((p) => p.id === pendingPreset);
        if (preset) {
          editLook(preset.look);
          sendRef.current?.({
            type: "look",
            patch: preset.look,
            preset: preset.id,
          });
        }
      } else if (msg.type === "error" && msg.code === "badToken") {
        setError("That QR code has expired. Scan the code on the TV again.");
        setToken(null);
      }
    }
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const updateLook = (patch, presetId) => {
    editLook(patch);
    send({ type: "look", patch, preset: presetId });
  };

  const pickPending = (id) => {
    setPendingPreset(id);
    store("catTvPreset", id);
  };

  const you = state?.you;
  const status = you?.status ?? "idle";

  const join = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    store("catTvName", trimmed);
    setEnded(null);
    setError(null);
    setStats(null);
    send({ type: "join", name: trimmed, token });
  };

  let view;
  if (!connected && !state) {
    view = <div className="center-msg">Connecting…</div>;
  } else if (status === "active") {
    view = (
      <PlayView
        you={you}
        state={state}
        send={send}
        connected={connected}
        look={look}
        onLookChange={updateLook}
        onSound={() => {
          if (turnRef.current) turnRef.current.sounds += 1;
          send({ type: "sound" });
        }}
      />
    );
  } else if (status === "queued") {
    view = (
      <WaitView
        you={you}
        state={state}
        look={look}
        pendingPreset={pendingPreset}
        onPick={pickPending}
        onLeave={() => send({ type: "leave" })}
      />
    );
  } else if (ended && (ended !== "left" || stats)) {
    view = (
      <DoneView
        ended={ended}
        name={name}
        catName={state?.catName}
        stats={stats}
        onDone={() => setEnded(null)}
      />
    );
  } else {
    view = (
      <JoinView
        state={state}
        token={token}
        error={error}
        name={name}
        setName={setName}
        connected={connected}
        onJoin={join}
      />
    );
  }

  return <div className="pp">{view}</div>;
}

// ─── Join ────────────────────────────────────────────────────────────────────

function JoinView({ state, token, error, name, setName, connected, onJoin }) {
  const waitingCount = state?.queueLength ?? 0;
  const wait = waitSeconds(state, waitingCount);
  const turn = readDuration(state?.maxSessionSeconds ?? 0);

  return (
    <section className="view">
      <Brand />
      <div className="join-hero pad-x">
        <div className="hero-icon">😺</div>
        <h3>Play with {state?.catName || "the cat"}</h3>
        <p>
          {token
            ? `Join the line and take control of the toy on the TV for ${turn}.`
            : "Scan the QR code on the TV to join the line."}
        </p>
      </div>
      <div className="pad-x">
        {error && <p className="error">{error}</p>}
        {token && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onJoin();
            }}
          >
            <div className="field">
              <label htmlFor="nameInput">Your name</label>
              <input
                id="nameInput"
                maxLength={16}
                placeholder="e.g. Alex"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!connected || !name.trim()}
            >
              Join the line
            </button>
          </form>
        )}
        <div className="meta">
          {!state?.active && waitingCount === 0
            ? "No wait — you're up right away"
            : waitingCount === 0
              ? `${state.active.name} is playing · about ${fmtWait(wait)}`
              : `${waitingCount} ${waitingCount === 1 ? "person" : "people"} waiting · about ${fmtWait(wait)}`}
        </div>
      </div>
    </section>
  );
}

// ─── Waiting ─────────────────────────────────────────────────────────────────

function WaitView({ you, state, look, pendingPreset, onPick, onLeave }) {
  const position = you.position;
  const wait = waitSeconds(state, position - 1);
  const circumference = 2 * Math.PI * 66;
  const fill = 1 / position;
  const waiting = state.waiting ?? [];

  return (
    <section className="view wait">
      <Brand />
      <div className="wait-top pad-x">
        <div className="ring">
          <svg viewBox="0 0 150 150">
            <circle
              cx="75"
              cy="75"
              r="66"
              stroke="#f3f4f6"
              strokeWidth="10"
              fill="none"
            />
            <circle
              cx="75"
              cy="75"
              r="66"
              stroke="#ff6a3d"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - fill)}
            />
          </svg>
          <div className="center">
            <div className="pos">#{position}</div>
            <div className="pos-l">in line</div>
          </div>
        </div>
        <h3>{position === 1 ? "You're up next!" : "You're in line"}</h3>
        <p>{wait <= 5 ? "Any second now…" : `About ${fmtWait(wait)}`}</p>
        <p style={{ marginTop: 4, fontSize: 12 }}>
          Keep this page open — your phone will buzz when it's your turn.
        </p>
      </div>

      <div className="pad-x setup">
        <div className="setup-head">
          <h4>Pick your setup</h4>
          <span className="preset-status hint-only">Swipe for more →</span>
        </div>
        <PresetRow
          base={look}
          selectedId={pendingPreset}
          onPick={(id) => onPick(id === pendingPreset ? null : id)}
        />
        <div className="setup-foot">
          You can fine-tune everything once it's your turn.
        </div>
      </div>

      <div className="pad-x">
        <ul className="line-list">
          {state.active && (
            <li>
              <span className="ix">▶</span>
              {state.active.name}
              <span className="tag live">Playing</span>
            </li>
          )}
          {waiting.map((n, i) => (
            <li key={`${i}-${n}`} className={i === position - 1 ? "me" : ""}>
              <span className="ix">{i + 1}</span>
              {n}
              {i === position - 1 && <span className="tag">You</span>}
            </li>
          ))}
        </ul>
        <div className="wait-actions">
          <button className="btn-link" onClick={onLeave}>
            Leave the line
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Presets ─────────────────────────────────────────────────────────────────

function StringIcon({ color }) {
  return (
    <svg className="str-ic" viewBox="0 0 18 9">
      <path d="M1 5c3-5 5 4 8 0s5-5 8 0" stroke={color} strokeWidth="2.2" />
    </svg>
  );
}

// A scene thumbnail with the preset's toy hanging on its string.
function PresetCard({ preset, base, selected, small, onClick }) {
  const look = { ...base, ...preset.look };
  const cursor = cursorById(look.cursorId);
  const sound = soundById(look.soundId);
  const color = colorById(look.stringColor);
  const ref = useRef(null);

  return (
    <button
      ref={ref}
      className={`pcard${small ? " small" : ""}${selected ? " sel" : ""}`}
      onClick={() => {
        onClick();
        ref.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      }}
    >
      <span className="pc-thumb" style={sceneThumbStyle(look.bgId)}>
        <svg viewBox="0 0 100 60" preserveAspectRatio="none">
          {cursor.isLaser ? (
            <path
              d="M20 50 Q40 20 62 18"
              stroke="rgba(255,45,45,0.7)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            look.showString && (
              <path
                d="M62 20 Q70 40 58 56"
                stroke={color.main}
                strokeWidth="1.6"
                fill="none"
                strokeLinecap="round"
              />
            )
          )}
        </svg>
        <span className="pc-toy">
          {cursor.isLaser ? <span className="laser-dot sm" /> : cursor.emoji}
        </span>
        <span className="pc-check">✓</span>
      </span>
      <span className="pc-body">
        <span className="pc-name">{preset.name}</span>
        {!small && <span className="pc-tag">{preset.tagline}</span>}
        <span className="pc-feats">
          <span className="pf">
            {look.soundId === "none" ? "🔇" : emojiOf(sound.label)}
            {!small &&
              (look.soundId === "none" ? " Silent" : ` ${nameOf(sound.label)}`)}
          </span>
          <span className="pf">
            {look.showString && !cursor.isLaser ? (
              <>
                <StringIcon color={color.main} />
                {!small && color.label}
              </>
            ) : small ? (
              "⊘"
            ) : (
              "No string"
            )}
          </span>
        </span>
      </span>
    </button>
  );
}

function PresetRow({ base, selectedId, onPick, small }) {
  return (
    <div className="pscroll">
      <div className={`pcards${small ? " small" : ""}`}>
        {PRESETS.map((p) => (
          <PresetCard
            key={p.id}
            preset={p}
            base={base}
            small={small}
            selected={p.id === selectedId}
            onClick={() => onPick(p.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Your turn ───────────────────────────────────────────────────────────────

const TAB_ICONS = {
  play: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  string: (
    <svg viewBox="0 0 24 24">
      <path d="M3 12c3-6 6 6 9 0s6 6 9 0" />
    </svg>
  ),
  scene: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M21 16l-5-5-8 8" />
    </svg>
  ),
  sound: (
    <svg viewBox="0 0 24 24">
      <path d="M11 5L6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 010 7" />
      <path d="M18.5 5.5a9 9 0 010 13" />
    </svg>
  ),
};

function PlayView({
  you,
  state,
  send,
  connected,
  look,
  onLookChange,
  onSound,
}) {
  const [tab, setTab] = useState("play");
  const secondsLeft = useCountdown(you.endsAt);
  const totalSeconds = (you.totalMs ?? 1) / 1000;
  const low = secondsLeft <= 10;
  const cursor = cursorById(look.cursorId);

  const waiting = state.waiting ?? [];
  const extendLeft = Math.max(0, Math.round((you.extendLeftMs ?? 0) / 1000));
  const canExtend = waiting.length === 0 && extendLeft > 0;

  let extNote;
  if (waiting.length > 0) {
    extNote = (
      <>
        <b>{waiting[0]}</b> is waiting, so you can't add more time
      </>
    );
  } else if (extendLeft <= 0) {
    extNote = "You've added the 3:00 maximum";
  } else {
    extNote = `No one's waiting · add up to 3:00 extra (${fmtSeconds(extendLeft)} left to add)`;
  }

  const tabs = [
    { id: "play", label: "Trackpad", icon: TAB_ICONS.play },
    {
      id: "toy",
      label: "Toy",
      icon: (
        <span className="tab-ic" key={look.cursorId}>
          {cursor.isLaser ? <span className="laser-dot sm" /> : cursor.emoji}
        </span>
      ),
    },
    { id: "string", label: "String", icon: TAB_ICONS.string },
    { id: "scene", label: "Scene", icon: TAB_ICONS.scene },
    { id: "sound", label: "Sound", icon: TAB_ICONS.sound },
  ];

  return (
    <section className="view">
      <div className="play-head">
        <div className="who">
          Your turn<b>{you.name}</b>
        </div>
        <div className="timer">
          <span className={`t${low ? " low" : ""}`}>
            {fmtSeconds(secondsLeft)}
          </span>
          <button
            className="ext-btn"
            disabled={!canExtend}
            onClick={() => send({ type: "extend" })}
            title="Add 30 seconds"
          >
            {extendLeft <= 0 ? "Max" : "+30s"}
          </button>
          <button className="end-btn" onClick={() => send({ type: "leave" })}>
            End
          </button>
        </div>
      </div>
      <div className="prog">
        <i
          style={{
            width: `${Math.min(100, (secondsLeft / totalSeconds) * 100)}%`,
          }}
        />
      </div>
      <div className="ext-note">{extNote}</div>

      {tab === "play" && (
        <TrackpadPane
          send={send}
          connected={connected}
          look={look}
          onLookChange={onLookChange}
          onSound={onSound}
          goToSound={() => setTab("sound")}
        />
      )}
      {tab === "toy" && <ToyPane look={look} onLookChange={onLookChange} />}
      {tab === "string" && (
        <StringPane look={look} onLookChange={onLookChange} />
      )}
      {tab === "scene" && <ScenePane look={look} onLookChange={onLookChange} />}
      {tab === "sound" && <SoundPane look={look} onLookChange={onLookChange} />}

      {tab !== "play" && (
        <div className="back-wrap">
          <button className="back-pad" onClick={() => setTab("play")}>
            {TAB_ICONS.play}
            <span className="bp-txt">
              <b>Back to trackpad</b>
              <small>Changes are live on the TV</small>
            </span>
            <span className={`bp-time${low ? " low" : ""}`}>
              {fmtSeconds(secondsLeft)}
            </span>
          </button>
        </div>
      )}

      <nav className="tabbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </section>
  );
}

// How far the toy moves per finger movement; 60% matches the TV's base gain.
const DEFAULT_SPEED = 60;

function TrackpadPane({
  send,
  connected,
  look,
  onLookChange,
  onSound,
  goToSound,
}) {
  const padRef = useRef(null);
  const touchRef = useRef(null);
  const lastRef = useRef(null);
  const pendingRef = useRef({ dx: 0, dy: 0 });
  const [touching, setTouching] = useState(false);
  const [speed, setSpeed] = useState(() =>
    Number(loadStored("catTvSpeed", DEFAULT_SPEED))
  );
  // Collapsing the quick picks leaves more room for the trackpad; remembered.
  const [picksCollapsed, setPicksCollapsed] = useState(
    () => loadStored("catTvPicksCollapsed", null) != null
  );
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

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

  const moveRing = (e) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (rect && touchRef.current) {
      touchRef.current.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`;
    }
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    moveRing(e);
    setTouching(true);
  };
  const onPointerMove = (e) => {
    const last = lastRef.current;
    if (!last || last.id !== e.pointerId) return;
    // Normalize by pad width so every phone moves the toy the same amount.
    const w = padRef.current?.clientWidth || 1;
    const gain = speedRef.current / DEFAULT_SPEED;
    pendingRef.current.dx += ((e.clientX - last.x) / w) * gain;
    pendingRef.current.dy += ((e.clientY - last.y) / w) * gain;
    lastRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    moveRing(e);
  };
  const onPointerUp = (e) => {
    if (lastRef.current?.id === e.pointerId) lastRef.current = null;
    setTouching(false);
  };

  const preset = matchingPreset(look);
  const sound = soundById(look.soundId);

  let soundArea;
  if (look.soundId === "none") {
    soundArea = (
      <div className="muted-note">
        Sound is off. <button onClick={goToSound}>Turn it on</button>
      </div>
    );
  } else if (look.soundMode === "auto") {
    soundArea = (
      <div className="muted-note">
        {emojiOf(sound.label)} {nameOf(sound.label)} plays automatically.{" "}
        <button onClick={goToSound}>Change</button>
      </div>
    );
  } else {
    soundArea = (
      <button className="btn btn-primary sound-btn" onClick={onSound}>
        <span className="em">{emojiOf(sound.label)}</span> Play “
        {nameOf(sound.label)}”
      </button>
    );
  }

  return (
    <div className="pane">
      <div>
        <div className="setup-head">
          <button
            className="collapse-toggle"
            aria-expanded={!picksCollapsed}
            onClick={() => {
              setPicksCollapsed(!picksCollapsed);
              store("catTvPicksCollapsed", picksCollapsed ? null : 1);
            }}
          >
            <svg
              className={`chev${picksCollapsed ? "" : " open"}`}
              viewBox="0 0 24 24"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            <h4>Quick picks</h4>
          </button>
          {!preset ? (
            <span className="preset-status">Custom</span>
          ) : (
            !picksCollapsed && (
              <span className="preset-status hint-only">Swipe for more →</span>
            )
          )}
        </div>
        {!picksCollapsed && (
          <PresetRow
            small
            base={look}
            selectedId={preset?.id}
            onPick={(id) =>
              onLookChange(PRESETS.find((p) => p.id === id).look, id)
            }
          />
        )}
      </div>
      <div
        ref={padRef}
        className={`trackpad${touching ? " active" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="tp-hint">
          <span className="ic">☝️</span>
          {connected ? "Drag here to move the toy" : "Reconnecting…"}
        </div>
        <div className="touch" ref={touchRef} />
      </div>
      {soundArea}
      <div className="slider">
        <div className="row">
          <span>Speed</span>
          <span className="val">{speed}%</span>
        </div>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={speed}
          onChange={(e) => {
            setSpeed(Number(e.target.value));
            store("catTvSpeed", e.target.value);
          }}
        />
      </div>
    </div>
  );
}

function RangeRow({ label, value, display, range, disabled, onChange }) {
  return (
    <div className="slider">
      <div className="row">
        <span>{label}</span>
        <span className="val">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span />
    </label>
  );
}

function ToyPane({ look, onLookChange }) {
  return (
    <div className="pane">
      <h4>Toy</h4>
      <div className="grid">
        {CURSORS.map((c) => (
          <button
            key={c.id}
            className={`opt${look.cursorId === c.id ? " sel" : ""}`}
            onClick={() => onLookChange({ cursorId: c.id })}
          >
            <span className="em">
              {c.isLaser ? <span className="laser-dot" /> : c.emoji}
            </span>
            <span className="lb">{nameOf(c.label)}</span>
          </button>
        ))}
      </div>
      <div className="card-group">
        <RangeRow
          label="Size"
          value={look.toySize}
          range={LOOK_RANGES.toySize}
          onChange={(v) => onLookChange({ toySize: v })}
        />
      </div>
    </div>
  );
}

function StringPane({ look, onLookChange }) {
  const off = !look.showString;
  return (
    <div className="pane">
      <h4>String</h4>
      <div className={`card-group${off ? " disabled" : ""}`}>
        <div className="row">
          <span>Show string</span>
          <Switch
            label="Show string"
            checked={look.showString}
            onChange={(v) => onLookChange({ showString: v })}
          />
        </div>
        <RangeRow
          label="Length"
          value={look.trailLength}
          range={LOOK_RANGES.trailLength}
          disabled={off}
          onChange={(v) => onLookChange({ trailLength: v })}
        />
        <RangeRow
          label="Thickness"
          value={look.trailWidth}
          display={Math.round((look.trailWidth / 8) * 2) / 2}
          range={LOOK_RANGES.trailWidth}
          disabled={off}
          onChange={(v) => onLookChange({ trailWidth: v })}
        />
        <RangeRow
          label="Bounciness"
          value={look.bounciness}
          display={`${look.bounciness}%`}
          range={LOOK_RANGES.bounciness}
          disabled={off}
          onChange={(v) => onLookChange({ bounciness: v })}
        />
        <div className="row sub">
          <span>Colour</span>
        </div>
        <div className="swatches">
          {STRING_COLORS.map((c) => (
            <button
              key={c.id}
              aria-label={c.label}
              className={`sw${look.stringColor === c.id ? " sel" : ""}`}
              style={{ background: c.main }}
              onClick={() => onLookChange({ stringColor: c.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScenePane({ look, onLookChange }) {
  return (
    <div className="pane">
      <h4>Scene</h4>
      <div className="scene-grid">
        {BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            className={`scene-opt${look.bgId === b.id ? " sel" : ""}`}
            onClick={() => onLookChange({ bgId: b.id })}
          >
            <span className="thumb" style={sceneThumbStyle(b.id)} />
            <span className="lb">
              {nameOf(b.label)}
              <span className="check">✓</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SoundPane({ look, onLookChange }) {
  const on = look.soundId !== "none";
  // Turning sound back on restores the last sound picked.
  const [lastSound, setLastSound] = useState(on ? look.soundId : "chirp");

  const pick = (id) => {
    setLastSound(id);
    onLookChange({ soundId: id });
  };
  const preview = (id) => {
    unlockAudio();
    playSound(id, look.volume);
  };

  return (
    <div className="pane">
      <h4>Sound</h4>
      <div className={`card-group${on ? "" : " disabled"}`}>
        <div className="row">
          <span>Sound button</span>
          <Switch
            label="Sound button"
            checked={on}
            onChange={(v) => onLookChange({ soundId: v ? lastSound : "none" })}
          />
        </div>
        <div className="row sub">
          <span>Play automatically</span>
          <Switch
            label="Play automatically"
            checked={look.soundMode === "auto"}
            onChange={(v) => onLookChange({ soundMode: v ? "auto" : "button" })}
          />
        </div>
        <RangeRow
          label="Volume"
          value={look.volume}
          display={`${look.volume}%`}
          range={LOOK_RANGES.volume}
          disabled={!on}
          onChange={(v) => onLookChange({ volume: v })}
        />
      </div>
      <div className={`sound-list${on ? "" : " disabled"}`}>
        {SOUNDS.filter((s) => s.id !== "none").map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            className={`sound-item${look.soundId === s.id ? " sel" : ""}`}
            onClick={() => pick(s.id)}
            onKeyDown={(e) => e.key === "Enter" && pick(s.id)}
          >
            <span className="em">{emojiOf(s.label)}</span>
            <span className="nm">{nameOf(s.label)}</span>
            <button
              className="preview"
              aria-label={`Preview ${nameOf(s.label)}`}
              onClick={(e) => {
                e.stopPropagation();
                preview(s.id);
              }}
            >
              ▶
            </button>
            <span className="radio" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Time's up ───────────────────────────────────────────────────────────────

function DoneView({ ended, name, catName, stats, onDone }) {
  const timeUp = ended === "timeUp";
  // "left" here means the player tapped End during their turn.
  const thanks = timeUp || ended === "left";
  return (
    <section className="view">
      <Brand />
      <div className="done pad-x">
        <div className="hero-icon">{timeUp ? "⏰" : "👋"}</div>
        <h3>
          {timeUp
            ? `Time's up, ${name}!`
            : ended === "left"
              ? `Thanks for playing, ${name}!`
              : (ENDED_TEXT[ended] ?? "Your turn is over.")}
        </h3>
        {thanks && <p>{catName || "The cat"} says thanks for playing.</p>}
        {stats && (
          <div className="stats">
            <div className="stat">
              <b>{fmtSeconds(stats.seconds)}</b>
              <span>Time played</span>
            </div>
            <div className="stat">
              <b>{stats.sounds}</b>
              <span>Sounds played</span>
            </div>
          </div>
        )}
        <p style={{ marginTop: 8 }}>
          Scan the QR code on the TV to play again.
        </p>
        <button className="btn-link" onClick={onDone}>
          I'm done
        </button>
      </div>
    </section>
  );
}
