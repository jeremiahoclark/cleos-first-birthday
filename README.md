# Cleo's First Birthday — Team Quest

A mobile-first party game for a Cloudflare Worker. Guests join with no login, get
dropped onto a randomized team with a playful name, race a 60-minute countdown, and
complete photo/video quests to fill a birthday memory archive for Cleo's parents.

The product spec lives in [`plan.html`](./plan.html) — open it in a browser for the
full design rationale. This README covers running, the dry-mode safety model, and
Cloudflare setup.

## What's in here

| Path | Purpose |
| --- | --- |
| `src/worker.js` | The Worker: API routes + static asset serving |
| `src/shared/quests.js` | Quest pool, staged randomization, scoring |
| `src/shared/teamNames.js` | Team-name generator + balanced assignment helper |
| `src/shared/device.js` | Device fingerprint + client IP helpers |
| `src/shared/dryRun.js` | The dry-mode gate (`isDryRun`, `persistWhenLive`) |
| `public/` | The mobile app (HTML/CSS/JS), incl. `compose.js` canvas compositor |
| `migrations/0001_initial.sql` | D1 schema |
| `tests/` | `node:test` suites for quests, scoring, dry-mode, device, team names |

## Quick start (local)

```bash
npm install        # installs wrangler
npm test           # run the test suite (node --test)
npm run dev        # wrangler dev — serves the app + API locally
```

`npm run dev` runs in **dry mode by default** (see below), so you can play the whole
game locally without any Cloudflare resources provisioned.

## Dry mode / BETA_MODE (the safety default)

**Dry mode is ON by default and prevents every write to D1, KV, and R2.** It is the
single most important safety property of this app: you cannot accidentally write real
guest data or media to Cloudflare storage while testing.

- Controlled by the `DRY_RUN` / `BETA_MODE` vars in `wrangler.jsonc` (both default
  `"true"`). They are aliases: **either one keeps writes blocked**, so to go live
  *both* must read `"false"` (the stricter setting always wins).
- It is **on for any value except the exact string `"false"`** — see
  `src/shared/dryRun.js`. This fail-safe means a typo never silently enables writes.
- **Enforced server-side**, not just in the UI. Every storage write goes through
  `persistWhenLive(env, op)`, which simply does not call `op` in dry mode. The D1
  insert / KV put / R2 put callback never executes.
- In dry mode the APIs **simulate success** (return generated IDs, scores, and the
  submitted media echoed back) so the client can run on local/demo state. The
  frontend also keeps its own state in `localStorage`.
- It is **visible in the UI**: a "Beta dry mode" pill shows in the top bar and on the
  host screen, and the join + feedback copy says nothing is being saved.

### Turning dry mode OFF (going live)

Only do this once your D1/KV/R2 bindings are real (see below):

```bash
# Edit wrangler.jsonc -> set BOTH vars.DRY_RUN AND vars.BETA_MODE to "false", then:
npm run deploy
```

When live, `getAdmin` reads from D1, `registerUser` writes the user row + a KV device
mapping, and `submitQuest` writes the submission row + media to R2.

## Cloudflare resources & bindings

The bindings are declared in `wrangler.jsonc`. Create the resources and paste the IDs
back into that file (the placeholders like `replace_with_d1_database_id` mark where).

### D1 (database — teams, users, submissions, feedback)

```bash
npx wrangler d1 create cleos-first-birthday
# copy the returned database_id into wrangler.jsonc -> d1_databases[0].database_id

# apply the schema
npx wrangler d1 migrations apply cleos-first-birthday          # remote
npx wrangler d1 migrations apply cleos-first-birthday --local  # local dev
```

Binding: `DB`.

### KV (device → user/team registration mapping)

```bash
npx wrangler kv namespace create DEVICE_KV
npx wrangler kv namespace create DEVICE_KV --preview
# copy id + preview_id into wrangler.jsonc -> kv_namespaces[0]
```

Binding: `DEVICE_KV`. We store `device:<sha256(fingerprint)>` → `{ userId, teamId,
eventId }`. The fingerprint combines the client-generated device id, user-agent,
client IP (`CF-Connecting-IP`), and accept-language — see `src/shared/device.js`.
This lets a returning phone be recognized without any login.

### R2 (media — photos & videos)

```bash
npx wrangler r2 bucket create cleos-first-birthday-media
```

Binding: `MEDIA_BUCKET`. Submissions are stored under
`events/<eventId>/teams/<teamId>/<submissionId>`. The parent gallery export reads
from here (export button is a placeholder until you wire a signed-URL listing).

## Game rules (implemented)

- **Teams**: guests are balanced onto teams (≤7), each with a generated name.
- **Quest board**: 10 quests. Slots 1–3, 4–6, 7–9 each have a pair of possible
  quests; each team randomly gets one of each pair (seeded by team id, so it's stable
  per team). Slot 10 is always **The Future Advice Council**. The pool includes **The
  Silly Hat Snapshot**.
- **Timer**: one 60-minute countdown (`GAME_DURATION_SECONDS`). The last 5 minutes
  trigger **urgency mode** — the timer pulses and a banner lists every quest the team
  hasn't submitted yet. At zero, an **awards/end screen** shows the team's final score
  out of 10 plus the (subjective, non-scoring) party awards.
- **Scoring**: exactly **1 point per completed quest, no partial credit**, max 10. A
  duplicate or rejected submission never adds points.
- **Camera**: live camera via `getUserMedia` with a graceful fallback to file upload
  when the camera is unavailable. Multi-shot capture for collage quests.
- **Composition** (`public/compose.js`, client-side canvas): caption-at-bottom,
  side-by-side reference, collage/set, or plain proof — previewed before submit.
- **Feedback**: dry-mode testers can submit ideas/bugs; in dry mode it stays local.

## API routes

| Route | Method | Notes |
| --- | --- | --- |
| `/api/status` | GET | event info, dry-mode flag, preview board |
| `/api/register` | POST | name + game name + device id → team assignment |
| `/api/submissions` | POST | quest proof submission, returns score |
| `/api/feedback` | POST | beta feedback |
| `/api/admin` | GET | teams, submissions, scores (dry mode returns empty) |

## Tests

```bash
npm test
```

Covers: staged quest generation (structure, slot-10 invariant, determinism, Silly Hat
presence), scoring (1pt/quest, no partial/double credit, rejected excluded), dry-mode
no-persistence (the write callback must never run), and device-registration helpers
(fingerprint, SHA-256 hash, client IP). See `tests/`.

## Deploy

```bash
npm run deploy   # wrangler deploy
```

Remember: deploy keeps dry mode ON unless you set `DRY_RUN: "false"` in
`wrangler.jsonc` first.
