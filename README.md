# Cat TV

A toy for cats to chase on a big screen. People nearby scan a QR code on the TV,
join a line, and when it's their turn their phone becomes a trackpad that moves
the toy.

| Page     | Who opens it                     |
| -------- | -------------------------------- |
| `/`      | The TV. Shows the toy and the join QR code. |
| `/play`  | Phones, via the QR code. Join the line, then drag to move the toy and pick the scene, toy and string settings. |
| `/admin` | The admin. Sets the max session length, skips or removes players. |

## Running

```sh
npm install
npm run dev                       # Vite on :5173 + queue server on :3001
```

Open `http://localhost:5173` on the TV machine. The QR code points phones at the
machine's LAN address, so phones must be on the same network.

Production (one process serves the built app and the WebSocket):

```sh
npm run build
ADMIN_PASSWORD=choose-one npm start   # http://<host>:3001
```

## Deploying

The queue needs a long-running server with WebSockets, so it's hosted on Render
via [render.yaml](render.yaml), not on Vercel. In Render: **New → Blueprint**, pick
this repo, and enter an `ADMIN_PASSWORD`. Pushes to `main` redeploy it.

On the free plan the disk is wiped on every deploy or restart, so the admin's
session length and the TV's look fall back to their defaults (2:30, Ocean, Fish) until set again.

## Configuration

| Env var          | Default | Purpose |
| ---------------- | ------- | ------- |
| `ADMIN_PASSWORD` | random, printed at startup | Password for `/admin`. |
| `PORT`           | `3001`  | Server port. |
| `PUBLIC_URL`     | LAN IP  | Base URL the QR code points to, e.g. when behind a domain or tunnel. |

The admin's session length is saved to `data/settings.json`.

## How a turn works

- The QR code carries a join token that rotates every minute (old codes work for
  about two), so only people who can see the TV can join.
- When a turn ends — time's up, the player taps "End my turn", or the admin skips
  them — the phone has to scan the QR code again to get back in line.
- A player who closes the page keeps their place for 30 s in line, or 10 s if it's
  their turn.
- While nobody is playing, the TV falls back to its own Manual / Auto mode.

## Scenes

Scene photos live in `src/assets/scenes/` as TV-sized JPEGs plus phone
thumbnails. To add one:

1. Drop the full-size photo in `src/assets/scene-backgrounds/` (not committed).
2. Run `npm run scenes` to generate `<name>.jpg` and `<name>-thumb.jpg`.
3. Add `{ id: "<name>", label: "..." }` to `BACKGROUNDS` in
   [src/shared/look.js](src/shared/look.js).
