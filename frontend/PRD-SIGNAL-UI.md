# SecureMailScope: "SIGNAL" frontend PRD and implementation plan

Status: approved to build (29 Sep 2026). Backend unchanged. Classic UI stays one click away.

## 1. Problem with the last two attempts

| Attempt | Why it failed |
|---|---|
| Classic | Matrix-green terminal cosplay. Mono everywhere, neon glow. Reads as a hobby project. |
| Sovereign | Correct, calm, but it is the default SaaS dashboard: left sidebar, rounded cards, navy + gold. Indistinguishable from 500 other admin panels. |

The problem is not the colour alone. It is the **layout model** (sidebar + card grid) and the **lack of a visual idea**.

## 2. The idea: SIGNAL

The product listens to mail traffic on the wire and reports what it hears. The interface is designed like a
**signal-intelligence instrument**: a precision device, not a web dashboard.

Reference family: industrial instruments (Teenage Engineering, Nothing OS, Braun, oscilloscopes, mission control),
not SaaS.

- **One signal colour.** Vermilion (International Orange, the colour of aviation alarms and black boxes) means
  *threat or attention* and nothing else. Everything else is carbon and bone.
- **Dot-matrix numerals.** Grades, counts and timers are set in a dot-matrix face, like an instrument readout.
- **The screen is alive.** A full-bleed WebGL signal field sits behind every screen. It is calm when the context is
  healthy and turns hot (vermilion interference) when you look at something critical.
- **Reticle framing.** Panels are framed by corner brackets (targeting reticle), not rounded cards.
- **No sidebar.** Navigation is a floating instrument dock at the bottom plus a ⌘K command palette.

## 3. Visual system

| Token | Value | Use |
|---|---|---|
| carbon | `#0A0A0B` | page |
| carbon-2 / 3 | `#111113` / `#18181B` | raised surfaces |
| hairline | `#26262A` | 1px rules, grid |
| bone | `#ECE8E1` | primary text, primary buttons (bone fill, carbon text) |
| ash / smoke | `#9A968F` / `#5E5B57` | secondary / tertiary text |
| **signal** | `#FF4F1A` | threat, critical, brand mark, active focus |
| amber | `#FFB020` | high severity, urgency |
| ice | `#A9DCF2` | encrypted / healthy / verified |
| lime | `#C8F05A` | pass / closed (used sparingly) |

Type: **Archivo** (variable width axis: expanded caps for headlines, normal for body), **Doto** (dot matrix) for
numerals and grades, **IBM Plex Mono** for hashes, hex, rule IDs.

Shape: square. 0px radius on panels, 2px on controls, full pill only for the dock and status chips.

Motion: every animation carries meaning.
- Page change: signal-colour scan wipe (a horizontal line sweeps the screen).
- Text: headings decode (scramble to final text) once on arrival.
- Numbers: roll with NumberFlow when data changes.
- Hover: spotlight follows the cursor inside panels; primary buttons are magnetic.
- Everything collapses to static under `prefers-reduced-motion`.

## 4. Libraries

| Library | Role |
|---|---|
| three + @react-three/fiber + drei | Signal field shader, handshake globe, session constellation, PQC lattice |
| gsap + @gsap/react | Text decode, SVG circuit drawing, timeline sequences |
| framer-motion | Layout/shared-element transitions (incident case file opens from its row), dock magnification |
| lenis | Smooth, weighted scrolling |
| @number-flow/react | Animated numeric readouts |
| cmdk | ⌘K command palette: every action in one place |
| sonner | Action feedback toasts (escalated, submitted, verified) |

## 5. Information architecture and flow (unchanged routes, simpler surface)

```
Login (handshake globe)
  └─ Incidents  (home for every role; tabs scoped by role, same as today)
       ├─ open a case file (full-screen overlay, shared-element from its row)
       │    why / evidence seal / twin tracks / your one next action / custody ledger
       ├─ SOC: Analyse (drop zone + samples) → Run (pipeline tunnel) → Report → Session
       ├─ Forensics: Evidence locker → Session (hex) → Export
       ├─ Auditor: Compliance (PQC lattice, frameworks) → Report
       └─ Admin: System
```

Persistent chrome:
- **Top strip**: mark, the mission line `SOC → IR ∥ DF → AUDIT` with your seat lit, ⌘K, identity.
- **Bottom dock**: 2 to 4 role destinations, magnifies on hover.
- **Ticker**: one live status line (engine, open incidents, SLA breaches).

Every technical term keeps its ⓘ plain-language explainer (glossary carried over).

## 6. Non-negotiables

- Backend, API client (`lib/api.js`), auth storage, route paths and role guards unchanged.
- Every action, required field and guard from the classic UI behaves identically.
- Classic UI remains available (toggle + `?ui=classic`). Git tag `ui-classic-v1` stays.
- WebGL is optional: no GPU → static fallback. Reduced motion → still frames.
- Phone width works (no horizontal scroll), both dark and light ("paper") themes.

## 7. Implementation plan

1. Replace the rejected `sovereign` skin with `signal` (same routing/logic layer, new presentation).
2. Tokens + fonts + Tailwind names (`carbon`, `bone`, `signal`...), global CSS, reduced-motion rules.
3. Primitives: Reticle panel, Spotlight, Decode text, Readout (NumberFlow), Dot grade, Magnetic button, Chip,
   Explain, Notice, Skeleton, Tabs.
4. Chrome: SignalField (global WebGL shader, heat uniform), top strip + mission line, dock, ⌘K palette,
   ticker, scan-wipe page transition, Lenis, Toaster.
5. Screens: Login → Incidents + case file overlay → Analyse/Run → Report + constellation → Session (STARTTLS
   circuit, hex) → Export → Investigations → IR / Forensics / Auditor (lattice) / Admin.
6. Verify: build, live walkthrough against the backend, phone width, light theme, reduced motion.
