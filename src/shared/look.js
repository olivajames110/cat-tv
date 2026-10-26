// What the toy, scene and sound are like. Shared by the TV, the phone controller and
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
  { id: "fly", label: "🪰 Fly", emoji: "🪰", baseSize: 30 },
  { id: "bug", label: "🦋 Butterfly", emoji: "🦋", baseSize: 32 },
  { id: "laser", label: "🔴 Laser", emoji: "●", baseSize: 18, isLaser: true },
  { id: "yarn", label: "🧶 Yarn", emoji: "🧶", baseSize: 36 },
  { id: "feather", label: "🪶 Feather", emoji: "🪶", baseSize: 32 },
];

// Sounds play on the TV (see src/sounds.js). "auto" plays one every few
// seconds; "button" plays one each time the player taps Play Sound.
export const SOUNDS = [
  { id: "none", label: "🔇 Off" },
  { id: "chirp", label: "🐤 Chirp" },
  { id: "squeak", label: "🐭 Squeak" },
  { id: "buzz", label: "🐝 Buzz" },
  { id: "trill", label: "🎶 Trill" },
  { id: "bell", label: "🔔 Jingle bell" },
  { id: "crinkle", label: "🛍️ Crinkle" },
  { id: "cricket", label: "🦗 Cricket" },
];
export const SOUND_MODES = ["auto", "button"];

// String colours: the main stroke and a darker edge.
export const STRING_COLORS = [
  { id: "red", label: "Red", main: "#ef4444", edge: "#991b1b" },
  { id: "amber", label: "Amber", main: "#f5c842", edge: "#c8961a" },
  { id: "green", label: "Green", main: "#22c55e", edge: "#15803d" },
  { id: "blue", label: "Blue", main: "#3b82f6", edge: "#1d4ed8" },
  { id: "white", label: "White", main: "#f9fafb", edge: "#9ca3af" },
  { id: "black", label: "Black", main: "#374151", edge: "#111827" },
];

export const LOOK_RANGES = {
  toySize: { min: 16, max: 200, step: 4 },
  trailWidth: { min: 4, max: 64, step: 2 },
  trailLength: { min: 10, max: 120, step: 5 },
  bounciness: { min: 0, max: 100, step: 5 },
  volume: { min: 0, max: 100, step: 5 },
};

export const DEFAULT_LOOK = {
  bgId: "ocean",
  cursorId: "fish",
  toySize: 36,
  trailWidth: 24,
  trailLength: 50,
  showString: true,
  stringColor: "amber",
  bounciness: 60,
  soundId: "none",
  soundMode: "button",
  volume: 60,
};

// Ready-made combinations. Each sets only the keys in its `look`; anything
// else (toy size, volume…) stays as it was.
export const PRESETS = [
  {
    id: "backyard-bird",
    name: "Backyard bird",
    tagline: "Classic outdoor chase",
    look: {
      cursorId: "bird",
      soundId: "chirp",
      bgId: "grassy-field",
      showString: true,
      stringColor: "amber",
      trailLength: 65,
      trailWidth: 24,
      bounciness: 60,
    },
  },
  {
    id: "laser-chase",
    name: "Laser chase",
    tagline: "Fast, silent, no string",
    look: {
      cursorId: "laser",
      soundId: "none",
      bgId: "cozy-floor",
      showString: false,
    },
  },
  {
    id: "mouse-hunt",
    name: "Mouse hunt",
    tagline: "Scurries along the sill",
    look: {
      cursorId: "mouse",
      soundId: "squeak",
      bgId: "window-sill",
      showString: true,
      stringColor: "black",
      trailLength: 45,
      trailWidth: 16,
      bounciness: 40,
    },
  },
  {
    id: "feather-wand",
    name: "Feather wand",
    tagline: "Big swoops and jingles",
    look: {
      cursorId: "feather",
      soundId: "bell",
      bgId: "full-window",
      showString: true,
      stringColor: "red",
      trailLength: 95,
      trailWidth: 32,
      bounciness: 85,
    },
  },
  {
    id: "buzzy-fly",
    name: "Buzzy fly",
    tagline: "Small, quick and buzzy",
    look: {
      cursorId: "fly",
      soundId: "buzz",
      bgId: "forest-floor",
      showString: true,
      stringColor: "black",
      trailLength: 35,
      trailWidth: 8,
      bounciness: 80,
    },
  },
  {
    id: "butterfly-garden",
    name: "Butterfly garden",
    tagline: "Gentle, floaty flutter",
    look: {
      cursorId: "bug",
      soundId: "trill",
      bgId: "grassy-field",
      showString: false,
    },
  },
];

// The preset whose settings all match `look`, if any.
export function matchingPreset(look) {
  return PRESETS.find((p) =>
    Object.entries(p.look).every(([k, v]) => look[k] === v)
  );
}

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
  if (STRING_COLORS.some((c) => c.id === patch.stringColor))
    out.stringColor = patch.stringColor;
  if (SOUNDS.some((x) => x.id === patch.soundId)) out.soundId = patch.soundId;
  if (SOUND_MODES.includes(patch.soundMode)) out.soundMode = patch.soundMode;
  return Object.keys(out).length ? out : null;
}
