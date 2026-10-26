import { useState } from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  Paper,
  Slider,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { CloseRounded } from "@mui/icons-material";
import useCatSocket, { fmtSeconds, useCountdown } from "./useCatSocket.js";

const PRESETS = [60, 120, 150, 300];
const QR_PRESETS = [25, 50, 75, 100];

export default function AdminPage() {
  const [password, setPassword] = useState(() => {
    try {
      return sessionStorage.getItem("catTvAdmin") ?? "";
    } catch {
      return "";
    }
  });
  const [submitted, setSubmitted] = useState(password);

  if (!submitted) {
    return (
      <Shell>
        <Typography sx={{ fontSize: 22, fontWeight: 700, mb: 2 }}>
          Cat TV admin
        </Typography>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(password);
          }}
          sx={{ display: "flex", gap: 1 }}
        >
          <TextField
            type="password"
            size="small"
            label="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            fullWidth
          />
          <Button type="submit" variant="contained">
            Sign in
          </Button>
        </Box>
      </Shell>
    );
  }

  return (
    <AdminConsole
      key={submitted}
      password={submitted}
      onSignOut={() => {
        try {
          sessionStorage.removeItem("catTvAdmin");
        } catch {
          /* ignore */
        }
        setPassword("");
        setSubmitted("");
      }}
    />
  );
}

function AdminConsole({ password, onSignOut }) {
  const [authFailed, setAuthFailed] = useState(false);
  const [draft, setDraft] = useState(null);
  const [qrDraft, setQrDraft] = useState(null); // while dragging the slider
  const [catDraft, setCatDraft] = useState(null);

  const { connected, state, send } = useCatSocket(
    { role: "admin", password },
    (msg) => {
      if (msg.type !== "auth") return;
      if (msg.ok) {
        try {
          sessionStorage.setItem("catTvAdmin", password);
        } catch {
          /* ignore */
        }
      } else {
        setAuthFailed(true);
      }
    }
  );
  const secondsLeft = useCountdown(state?.active?.endsAt);

  if (authFailed) {
    return (
      <Shell>
        <Typography sx={{ mb: 2 }}>Wrong password.</Typography>
        <Button variant="contained" onClick={onSignOut}>
          Try again
        </Button>
      </Shell>
    );
  }

  if (!state?.queue) {
    return (
      <Shell>
        <Typography>{connected ? "Signing in…" : "Connecting…"}</Typography>
      </Shell>
    );
  }

  const current = state.maxSessionSeconds;
  const draftSeconds = draft ?? String(current);
  const parsed = Number(draftSeconds);
  const valid = Number.isFinite(parsed) && parsed >= 10 && parsed <= 3600;

  const save = (seconds) => {
    send({ type: "settings", maxSessionSeconds: seconds });
    setDraft(null);
  };

  return (
    <Shell>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 700, flex: 1 }}>
          Cat TV admin
        </Typography>
        <Button size="small" onClick={onSignOut}>
          Sign out
        </Button>
      </Box>

      <Typography sx={{ fontWeight: 700, mb: 1 }}>
        Max session length
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.7, mb: 1.5 }}>
        How long each person controls the toy before they have to scan the QR
        code again. Currently {fmtSeconds(current)}. Applies from the next turn.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        {PRESETS.map((s) => (
          <Button
            key={s}
            variant={current === s ? "contained" : "outlined"}
            onClick={() => save(s)}
          >
            {fmtSeconds(s)}
          </Button>
        ))}
      </Box>
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save(parsed);
        }}
        sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}
      >
        <TextField
          size="small"
          type="number"
          label="Seconds"
          value={draftSeconds}
          onChange={(e) => setDraft(e.target.value)}
          error={!valid}
          helperText={valid ? " " : "10 – 3600 seconds"}
          sx={{ width: 140 }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={!valid || parsed === current}
        >
          Save
        </Button>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography sx={{ fontWeight: 700, mb: 1 }}>QR code size</Typography>
      <Typography variant="body2" sx={{ opacity: 0.7, mb: 1.5 }}>
        Size of the scan-to-play code on the TV. Below 60% only the code is
        shown, without the "now playing" text.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
        {QR_PRESETS.map((pct) => (
          <Button
            key={pct}
            variant={state.qrSizePercent === pct ? "contained" : "outlined"}
            onClick={() => send({ type: "settings", qrSizePercent: pct })}
          >
            {pct}%
          </Button>
        ))}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 1 }}>
        <Slider
          min={25}
          max={100}
          step={5}
          value={qrDraft ?? state.qrSizePercent}
          onChange={(_, v) => setQrDraft(v)}
          onChangeCommitted={(_, v) => {
            send({ type: "settings", qrSizePercent: v });
            setQrDraft(null);
          }}
          aria-label="QR code size"
        />
        <Typography sx={{ width: 48, textAlign: "right" }}>
          {qrDraft ?? state.qrSizePercent}%
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography sx={{ fontWeight: 700, mb: 1 }}>Cat's name</Typography>
      <Typography variant="body2" sx={{ opacity: 0.7, mb: 1.5 }}>
        Shown on the TV as "Play with {state.catName || "the cat"}". Leave blank
        for "the cat".
      </Typography>
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "settings", catName: catDraft ?? state.catName });
          setCatDraft(null);
        }}
        sx={{ display: "flex", gap: 1 }}
      >
        <TextField
          size="small"
          label="Name"
          placeholder="the cat"
          value={catDraft ?? state.catName}
          onChange={(e) => setCatDraft(e.target.value)}
          inputProps={{ maxLength: 20 }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={catDraft == null || catDraft.trim() === state.catName}
        >
          Save
        </Button>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>Auto move</Typography>
          <Typography variant="body2" sx={{ opacity: 0.7 }}>
            While nobody is playing, the toy roams around the screen. When off,
            it bobs gently beside the QR code.
          </Typography>
        </Box>
        <Switch
          checked={!!state.autoMove}
          onChange={(e) =>
            send({ type: "settings", autoMove: e.target.checked })
          }
          inputProps={{ "aria-label": "Auto move" }}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography sx={{ fontWeight: 700, mb: 1 }}>Refresh screens</Typography>
      <Typography variant="body2" sx={{ opacity: 0.7, mb: 1.5 }}>
        Reloads the page, e.g. to pick up a new version. Phones keep their place
        in line.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          variant="outlined"
          onClick={() => send({ type: "reload", target: "display" })}
        >
          Refresh TV
        </Button>
        <Button
          variant="outlined"
          onClick={() => send({ type: "reload", target: "all" })}
        >
          Refresh TV and phones
        </Button>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
        <Typography sx={{ fontWeight: 700, flex: 1 }}>
          Line ({state.queue.length})
        </Typography>
        <Button
          size="small"
          disabled={!state.active}
          onClick={() => send({ type: "skip" })}
        >
          Skip current
        </Button>
        <Button
          size="small"
          color="error"
          disabled={state.queue.length === 0}
          onClick={() => send({ type: "clear" })}
        >
          Clear all
        </Button>
      </Box>

      {state.queue.length === 0 ? (
        <Typography variant="body2" sx={{ opacity: 0.6 }}>
          Nobody in line.
        </Typography>
      ) : (
        state.queue.map((p, i) => (
          <Box
            key={p.clientId}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              py: 0.5,
              opacity: p.connected ? 1 : 0.5,
            }}
          >
            <Typography sx={{ width: 28, opacity: 0.6 }}>
              {p.active ? "▶" : i}
            </Typography>
            <Typography sx={{ flex: 1 }}>
              {p.name}
              {!p.connected && " (disconnected)"}
            </Typography>
            {p.active && (
              <Typography sx={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtSeconds(secondsLeft)}
              </Typography>
            )}
            <IconButton
              size="small"
              aria-label={`Remove ${p.name}`}
              onClick={() => send({ type: "kick", clientId: p.clientId })}
            >
              <CloseRounded fontSize="small" />
            </IconButton>
          </Box>
        ))
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        background: "#f1f5f9",
        p: 2,
      }}
    >
      <Paper sx={{ p: 3, width: "100%", maxWidth: 480, mt: { xs: 0, sm: 6 } }}>
        {children}
      </Paper>
    </Box>
  );
}
