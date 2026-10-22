// What the toy and scene look like. Shared by the TV, the phone controller and
// the server (which validates every change), so keep this file free of JSX and
// asset imports.

// Each scene is a photo in src/assets/scenes/<id>.jpg (see src/scenes.js).
export const BACKGROUNDS = [
  { id: "grassy-field", label: "🌾 Grassy Field" },
  { id: "forest-floor", label: "🌲 Forest Floor" },
  { id: "ocean", label: "🌊 Ocean" },
  { id: "winter", label: "❄️ Winter" },
  { id: "window-sill", label: "🪴 Window Sill" },
  { id: "full-window", label: "🪟 Big Window" },
  { id: "cozy-floor", label: "🛋️ Cozy Floor" },
  { id: "catpurrccinos", label: "☕ Catpurrccino's" },
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
  bgId: "grassy-field",
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
