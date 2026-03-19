

# The Wall — Enhancement Plan

Six features to make The Wall feel alive, deep, and interactive while preserving the minimal Guilty aesthetic.

---

## 1. Confession Counter / Running Total

Add a slowly incrementing counter below the header: `1,842 CONFESSIONS RECORDED`. Starts at a base number (matching the highest confessor ID) and increments by 1 each time a new confession is inserted. Small, monospaced, low-opacity text — system-log style.

**Location**: Between the header subtext and the "LIVE CONFESSIONS" indicator.

---

## 2. Sound Design (Micro-Interactions)

Add an optional ambient tone when new confessions appear. A tiny toggle in the top-right corner: `SOUND` with a muted/unmuted state. Use the Web Audio API to generate a short, low-frequency sine wave click (no audio files needed). Default state: off.

**Implementation**: `useRef` for `AudioContext`, a helper function `playTone()` that creates a brief oscillator node. Called inside `insertConfession`. Toggle stored in state.

---

## 3. "Submit Your Own" Entry Point

At the bottom of the feed (before the footer), add a minimal CTA block:

```
YOUR TURN.
ENTER THE BOOTH →
```

Links to `/confess`. Styled as small uppercase monospaced text with low opacity, a subtle hover glow. No buttons — just text as a link.

---

## 4. Infinite Scroll with Pagination

When the user scrolls near the bottom of the feed, dynamically generate and append more confessions from a shuffled pool. Use an `IntersectionObserver` on a sentinel element at the bottom. Each batch appends 5 entries with older timestamps and lower confessor IDs, reinforcing the "deep archive" illusion. Cap at ~50 total entries for performance.

---

## 5. Typing Ghost Effect

Before a new confession is inserted, show a brief "someone is confessing..." indicator at the top of the feed with a blinking cursor. Appears 3-4 seconds before the actual confession drops in. Small, ritual-green text, fades in and out. This replaces the current instant insertion with a two-phase sequence: ghost preview → system message → confession appears.

**Sequence**: `showGhost(true)` → 3s delay → `showGhost(false)` + `flashSystemMessage()` → 400ms → insert confession.

---

## 6. Time-of-Day Atmosphere

Read the user's local hour via `new Date().getHours()`. Between 10PM–5AM ("late night"), increase scan-line opacity from `0.03` to `0.06`, slow the scan-line animation from `8s` to `12s`, and increase the live-pulse intensity. During daytime, keep current values. Applied via a `timeAtmosphere` object computed once on mount.

---

## Files Modified

- **`src/pages/TheWall.tsx`** — All six features added to the existing component.

No new files, no new dependencies.

