# Handoff: SIGNAL frontend redesign

Date: 2026-09-29 · Branch: `backend-flow-reconfig` · Nothing from the redesign is committed yet.

## Goal (from the user)
A complete frontend makeover that does not look generic, is striking at first sight, interactive and
immersive, uses animated component libraries and 3D where it helps, keeps the user flow simple, explains
every feature briefly, and keeps the old UI available as a backup. The backend stays unchanged.

History of what the user rejected:
1. **Classic** (original): matrix-green hacker terminal.
2. **Sovereign** (navy + gold, sidebar + rounded cards): "generic". Deleted; its code was renamed and
   rebuilt as `signal`. The user liked only its **login globe** concept, which was kept.

Current direction: **SIGNAL**, spec in [PRD-SIGNAL-UI.md](PRD-SIGNAL-UI.md). The user has not yet
reviewed the finished SIGNAL build.

## State
- Build passes (`npx vite build` in `frontend/`). Main chunk about 238 KB; three.js is lazy-loaded.
- Verified with headless Chrome against the live backend (localhost:8080): login, incidents plus case
  file, report, session, analyse, export, investigations, auditor, forensics and admin screens, ⌘K
  palette navigation, light theme, 390px phone width. No runtime errors (one favicon 404).
- **Not verified:** the three.js scenes' colours on a real GPU. Headless SwiftShader renders every
  material dim, so the login globe packets looked black there. On the GPU pane earlier (sovereign
  palette) they rendered correctly. Instance colours are now pre-allocated
  (`<instancedBufferAttribute attach="instanceColor">`). Ask the user to confirm the login globe.

## Architecture
- SIGNAL is the only UI. `src/main.jsx` renders `src/signal/App.jsx` directly; there is no skin switch.
- The classic UI is archived, unbuilt, in `frontend/legacy-classic/` (snapshot of App, index.css,
  components, pages, plus a copy of lib). Also in git: tag `ui-classic-v1`, branch `ui-classic`.
- `src/lib/api.js`, `src/lib/auth.js` (token key `sms-token`) and `src/lib/format.js` are the shared
  API layer used by `src/signal/`.
### `src/signal/`
| Path | What |
|---|---|
| `signal.css` | Tokens as RGB channels (`--s-carbon`, `--s-bone`, `--s-signal`, `--s-ice`, `--s-heat`, `--s-mid`, `--s-go`...), paper theme under `[data-theme='light']`, semantic aliases (`--s-danger`, `--s-safe`...), `.sg-panel` (reticle corners and spotlight), `.sg-btn-*`, `.sg-input`, marquee/skeleton |
| `tailwind.config.js` | Colour names `carbon`, `carbon-2..4`, `hair`, `hair-2`, `bone`, `ash`, `smoke`, `signal`, `heat`, `mid`, `ice`, `go`; fonts `font-ui` (Archivo), `font-code` (IBM Plex Mono), `font-dot` (Doto) |
| `ui.jsx` | Primitives: `Decode` (scramble text), `Readout` (NumberFlow dot-matrix), `Magnetic`, `Explain` (ⓘ glossary tooltip, portalled), `Panel`, `PageHeader`, `SectionTitle`, `Grade`, `Severity`, `Tag`, `Stat`, `Notice`, `Empty`, `Loading`, `KV`, `HashText`, `ShapBars`, `Tabs` |
| `lib/glossary.js` | One-line explanations for every term |
| `lib/roles.js` | `ReportContext` / `useReport`, role metadata |
| `components/SignalField.jsx` | Raw WebGL full-screen shader background, plus `HeatProvider` / `useHeat(level)` so screens tint it vermilion |
| `components/CaseRail.jsx` | Mission line `SOC → IR ∥ DF → AUDIT` |
| `components/Dock.jsx`, `CommandPalette.jsx` | Bottom magnifying dock, ⌘K (cmdk) |
| `components/IncidentDetail.jsx` | Case file body; every triage/track/audit guard is copied from classic; sonner toasts |
| `components/StartTlsMachine.jsx` | STARTTLS state derived from real session fields, animated circuit |
| `three/` | `Scene3D` (WebGL check, reduced motion, pause offscreen, lazy `CanvasHost`), `HandshakeScene` (login), `PipelineScene` (job), `ConstellationScene` (report), `LatticeScene` (PQC) |
| `components/ConstellationPanel.jsx` | Report constellation wrapper: grade / anomaly filter chips, framer-motion hover inspector, legend |
| `pages/` | One per route, same paths as classic |

## Behaviour differences vs classic (intentional)
- Export page loads its own report when opened directly (classic showed "Nothing to export").
- Removed no-op buttons on the session page (Acknowledge / False Positive / Escalate to IR) and the
  hard-coded fake state machine.
- IR role sees no links to report pages (their route would redirect them).
- Auditor audit-log and queue links point to `/report/:id`, not the session route they can't access.
- The triage textarea is labelled "Triage note". It is still required for both Escalate and Dismiss,
  as in classic.

## Open items / next steps
1. User review of SIGNAL; iterate on feedback.
2. Confirm the three.js scene colours on a real GPU (login globe, constellation, lattice, pipeline).
3. Ask the user whether to commit (nothing committed). Git identity is not configured globally; the
   earlier commit used `-c user.name=ojasb -c user.email=zenonx128@gmail.com` with the user's approval.
4. `gsap` and `@gsap/react` are installed but unused. Use them for further motion or uninstall.
5. The dev server caches `tailwind.config.js`; restart Vite after token changes.
6. Pre-existing, not addressed: `AuditVerificationQueue` (legacy, in both skins) runs
   `adaptBackendCapture` on capture summaries, so it likely never finds sessions.

## How to run / check
```bash
npm --prefix frontend run dev
```
- Launch config: `.claude/launch.json` (name `frontend`, port 5173). Backend must be on 8080.
- Demo users: analyst / ir / forensics / auditor / admin, password `password`.
- Screenshot harness (outside the repo): puppeteer-core with `/usr/bin/google-chrome-stable`; script
  pattern in the session scratchpad `shot.mjs` (logs in via `/api/auth/login`, sets `sms-token`,
  visits `?ui=signal` routes).

## Update 2026-09-29 (session 2)
- Classic UI removed from the app and archived to `frontend/legacy-classic/`; `uiMode.js`,
  `classic-entry.jsx` and the "Classic interface" buttons (menu, ⌘K, login) are gone. Tailwind config
  no longer carries the classic tokens.
- Constellation rebuilt: custom GLSL point-sprite stars (glow, twinkle, pulsing anomaly rings, hover
  reticle), flowing packet arcs (one `lineSegments` draw), dotted core shell with shimmer, grade band
  rings, fresnel core with gimbals + drei `Sparkles`, capped deep-field dust, inside-out intro with a
  camera dolly, `@react-three/postprocessing` Bloom + Vignette (dark theme only), instanced invisible
  hit targets. Verified on the real Intel GPU (headless Chrome with `--use-angle=vulkan`) in both themes.
- `.claude/launch.json` gained `frontend-5174`, but the backend rejects CORS from origin :5174, so use
  the :5173 server for live checks.
