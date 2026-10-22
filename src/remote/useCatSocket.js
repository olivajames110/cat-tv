import { useCallback, useEffect, useRef, useState } from "react";

// Connects to the Cat TV server, says hello with `hello` on every (re)connect,
// and exposes the latest `state` message. Other messages go to `onMessage`.
export default function useCatSocket(hello, onMessage) {
  const wsRef = useRef(null);
  const helloRef = useRef(hello);
  const onMessageRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);

  useEffect(() => {
    helloRef.current = hello;
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    let closed = false;
    let retry;
    let delay = 500;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        delay = 500;
        setConnected(true);
        ws.send(JSON.stringify({ type: "hello", ...helloRef.current }));
      };
      ws.onmessage = (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.type === "state") {
          // Turn server-relative durations into local deadlines so clock
          // skew between devices doesn't matter.
          const now = Date.now();
          if (msg.active) msg.active.endsAt = now + msg.active.remainingMs;
          if (msg.you?.remainingMs != null)
            msg.you.endsAt = now + msg.you.remainingMs;
          setState(msg);
        }
        onMessageRef.current?.(msg);
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 8000);
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { connected, state, send };
}

// Ticks once a second while `endsAt` is in the future; returns whole seconds left.
export function useCountdown(endsAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}

export function fmtSeconds(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
