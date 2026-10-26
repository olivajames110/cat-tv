import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { fmtSeconds, useCountdown } from "./remote/useCatSocket.js";
import Logo from "./assets/logo.png";
import "./tv.css";

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

// "150" → "2:30 turns", "120" → "2-minute turns", "45" → "45-second turns".
function turnLength(seconds) {
  if (seconds < 60) return `${seconds}-second turns`;
  if (seconds % 60 === 0) return `${seconds / 60}-minute turns`;
  return `${fmtSeconds(seconds)} turns`;
}

// Everything drawn over the scene. While nobody plays: the logo, an
// invitation and a big scan panel. During a turn: a now-playing pill and a
// small QR card. `toast` is { text, show } from the parent.
export default function TvOverlay({ state, toast }) {
  const joinUrl = state?.joinToken ? joinUrlFor(state) : null;
  const [qr, setQr] = useState(null);
  const active = state?.active;
  const secondsLeft = useCountdown(active?.endsAt);

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    // High error correction so the paw badge in the middle doesn't break it.
    QRCode.toDataURL(joinUrl, {
      margin: 0,
      width: 600,
      errorCorrectionLevel: "H",
    }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  const scale = (state?.qrSizePercent ?? 100) / 100;
  const waiting = state?.waiting ?? [];
  const totalSeconds = active ? active.totalMs / 1000 : 1;
  const catName = state?.catName || "the cat";

  return (
    <div
      className={`tvo${active ? " playing" : ""}${scale < 0.6 ? " qr-small" : ""}`}
      style={{ "--qr": scale }}
    >
      <div className="scrim" />
      <img className="brand-corner" src={Logo} alt="Catpurrccino's" />

      <div className="attract">
        <h2>
          Play with {catName}
          <br />
          <em>from your phone</em>
        </h2>
        <p className="tagline">
          <b>{turnLength(state?.maxSessionSeconds ?? 0)}</b> · Free · No app
          needed
        </p>
        <ol className="steps">
          <li>
            <b>1</b>Scan the code
          </li>
          <li>
            <b>2</b>Enter your name
          </li>
          <li>
            <b>3</b>Move the toy
          </li>
        </ol>
      </div>

      {active && (
        <div className="np">
          <div className="avatar">{active.name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="lbl">Playing with {catName}</div>
            <div className="nm">{active.name}</div>
          </div>
          <div className={`tm${secondsLeft <= 10 ? " low" : ""}`}>
            {fmtSeconds(secondsLeft)}
          </div>
          <div className="bar">
            <i
              style={{
                width: `${Math.min(100, (secondsLeft / totalSeconds) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {qr && (
        <aside className="side">
          <div className="scan-title">Scan to play</div>
          <div className="qr">
            <img src={qr} alt="Scan to play" />
            <span className="paw">🐾</span>
          </div>
          <div className="scan-hint">
            <span className="up">↑</span> Point your camera here
          </div>
          <div className="compact-q">
            {waiting.length > 0
              ? `Scan to join · ${waiting.length} waiting`
              : "Scan to play next"}
          </div>
          {waiting.length === 0 ? (
            <div className="nowait">
              <i /> No wait — play now
            </div>
          ) : (
            <div className="queue">
              <div className="q-head">
                <span>Up next</span>
                <span>{waiting.length}</span>
              </div>
              <ul className="q-list">
                {waiting.slice(0, 3).map((name, i) => (
                  <li key={`${i}-${name}`}>
                    <span className="n">{i + 1}</span>
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      )}

      <div className={`toast${toast?.show ? " show" : ""}`}>{toast?.text}</div>
    </div>
  );
}
