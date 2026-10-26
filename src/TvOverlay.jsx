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

// Everything drawn over the scene: while nobody plays, an invitation and a
// big scan panel; during a turn, a now-playing pill and a small QR card.
// `toast` is { text, show } from the parent.
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
      width: 400,
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

  return (
    <div
      className={`tvo${active ? " playing" : ""}${scale < 0.6 ? " qr-small" : ""}`}
      style={{ "--qr": scale }}
    >
      <div className="scrim" />

      <div className="attract">
        <img className="logo" src={Logo} alt="Catpurrccino's" />
        <span className="eyebrow">Catpurrccino's TV · Interactive</span>
        <h2>
          Play with the cat
          <br />
          <em>from your phone</em>
        </h2>
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
        <span className="point">
          Point your camera at the QR code <span className="arr">→</span>
        </span>
      </div>

      {active && (
        <div className="np">
          <div className="avatar">{active.name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="lbl">Now playing</div>
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
          <div className="scan-sub">Free · no app needed</div>
          <div className="qr">
            <img src={qr} alt="Scan to play" />
            <span className="paw">🐾</span>
          </div>
          <div className="compact-q">
            {waiting.length > 0
              ? `Scan to join · ${waiting.length} waiting`
              : "Scan to play next"}
          </div>
          <div className="queue">
            <div className="q-head">
              <span>Up next</span>
              {waiting.length > 0 && <span>{waiting.length}</span>}
            </div>
            <ul className="q-list">
              {waiting.length === 0 ? (
                <li className="empty">No one yet — you could be first!</li>
              ) : (
                waiting.slice(0, 5).map((name, i) => (
                  <li key={`${i}-${name}`}>
                    <span className="n">{i + 1}</span>
                    {name}
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      )}

      <div className={`toast${toast?.show ? " show" : ""}`}>{toast?.text}</div>
    </div>
  );
}
