import {
  Box,
  Typography,
  Button,
  Slider as MuiSlider,
  Checkbox,
  Divider,
} from "@mui/material";
import { BACKGROUNDS, CURSORS, LOOK_RANGES } from "./shared/look.js";
import { sceneThumbStyle } from "./scenes.js";

// ─── MUI Slider wrapper ───────────────────────────────────────────────────────

export function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0 }}>
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

// ─── Look controls (Tune / Cursor / Scenes tab bodies) ────────────────────────

// Renders the body of one control-panel tab. Used by the TV's panel and the
// phone's customize panel. `tuneExtra` is slotted in after Toy Size.
export default function LookControls({ tab, look, onChange, tuneExtra }) {
  if (tab === "bg") {
    return (
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        {BACKGROUNDS.map((b) => (
          <Button
            key={b.id}
            onClick={() => onChange({ bgId: b.id })}
            sx={{
              ...sceneThumbStyle(b.id),
              minHeight: 64,
              alignItems: "flex-end",
              textShadow: "0 1px 3px rgba(0,0,0,0.8)",
              color: "white",
              fontSize: 12,
              borderRadius: 2,
              border:
                look.bgId === b.id
                  ? "2px solid white"
                  : "2px solid rgba(255,255,255,0.2)",
              boxShadow:
                look.bgId === b.id ? "0 0 10px rgba(255,255,255,0.3)" : "none",
              textTransform: "none",
              "&:hover": { opacity: 0.85, transform: "scale(1.04)" },
              transition: "all 0.2s",
            }}
          >
            {b.label}
          </Button>
        ))}
      </Box>
    );
  }

  if (tab === "cursor") {
    return (
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        {CURSORS.map((c) => (
          <Button
            key={c.id}
            onClick={() => onChange({ cursorId: c.id })}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.25,
              color: "white",
              fontSize: 11,
              borderRadius: 2,
              py: 1.25,
              border:
                look.cursorId === c.id
                  ? "2px solid white"
                  : "2px solid rgba(255,255,255,0.2)",
              background:
                look.cursorId === c.id
                  ? "rgba(255,255,255,0.3)"
                  : "rgba(255,255,255,0.08)",
              boxShadow:
                look.cursorId === c.id
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
    );
  }

  return (
    <Box sx={{ mt: 1 }}>
      <Slider
        label="Toy Size"
        value={look.toySize}
        {...LOOK_RANGES.toySize}
        onChange={(v) => onChange({ toySize: v })}
        fmt={(v) => `${v}px`}
      />

      {tuneExtra}

      <Divider sx={{ borderColor: "rgba(255,255,255,0.1)", my: 2 }} />

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.8)" }}>
          Show String
        </Typography>
        <Checkbox
          sx={{ color: "#ffffff", p: 0 }}
          color="inherit"
          checked={look.showString}
          onChange={(e) => onChange({ showString: e.target.checked })}
        />
      </Box>

      {look.showString && (
        <>
          <Slider
            label="String Thickness"
            value={look.trailWidth}
            {...LOOK_RANGES.trailWidth}
            onChange={(v) => onChange({ trailWidth: v })}
            fmt={(v) => `${v}pt`}
          />
          <Slider
            label="String Length"
            value={look.trailLength}
            {...LOOK_RANGES.trailLength}
            onChange={(v) => onChange({ trailLength: v })}
            fmt={(v) => (v < 40 ? "Short" : v < 85 ? "Medium" : "Long")}
          />
        </>
      )}
    </Box>
  );
}
