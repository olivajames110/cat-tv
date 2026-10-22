// What the toy and scene look like. Shared by the TV, the phone controller and
// the server (which validates every change), so keep this file free of JSX and
// asset imports.

export const BACKGROUNDS = [
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

export const CURSORS = [
  { id: "mouse", label: "🐭 Mouse", emoji: "🐭", baseSize: 36 },
  { id: "bird", label: "🐦 Bird", emoji: "🐦", baseSize: 34 },
  { id: "fish", label: "🐟 Fish", emoji: "🐟", baseSize: 34 },
  { id: "bug", label: "🦋 Butterfly", emoji: "🦋", baseSize: 32 },
  { id: "laser", label: "🔴 Laser", emoji: "●", baseSize: 18, isLaser: true },
  { id: "yarn", label: "🧶 Yarn", emoji: "🧶", baseSize: 36 },
  { id: "feather", label: "🪶 Feather", emoji: "🪶", baseSize: 32 },
];

export const LOOK_RANGES = {
  toySize: { min: 16, max: 200, step: 4 },
  trailWidth: { min: 4, max: 64, step: 2 },
  trailLength: { min: 10, max: 120, step: 5 },
};

export const DEFAULT_LOOK = {
  bgId: "grass",
  cursorId: "mouse",
  toySize: 36,
  trailWidth: 24,
  trailLength: 50,
  showString: true,
};

// Keeps only known keys with valid values; returns null if nothing survives.
export function sanitizeLookPatch(patch) {
  if (!patch || typeof patch !== "object") return null;
  const out = {};
  if (BACKGROUNDS.some((b) => b.id === patch.bgId)) out.bgId = patch.bgId;
  if (CURSORS.some((c) => c.id === patch.cursorId))
    out.cursorId = patch.cursorId;
  for (const [key, { min, max }] of Object.entries(LOOK_RANGES)) {
    const v = patch[key];
    if (typeof v === "number" && Number.isFinite(v))
      out[key] = Math.max(min, Math.min(max, v));
  }
  if (typeof patch.showString === "boolean") out.showString = patch.showString;
  return Object.keys(out).length ? out : null;
}
