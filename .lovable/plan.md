

## Contraband Section — Making Drops Feel Elusive & Desirable

### Problem
The current cards are flat and static — just text labels like "CLASSIFIED" and "REDACTED" with minimal visual treatment. They feel like placeholder data rather than coveted hidden items.

### Proposed Updates

**1. Richer drop data with evocative names and descriptions**
Replace generic labels with cryptic but intriguing item names (e.g., "BATCH 77 — BURNT SERMON", "TRIAL 13 — ABSOLUTION TONIC") and short teaser descriptions that hint at what the item might be without revealing it. Add a "drop date" or "last sighted" timestamp for urgency.

**2. Redacted / censored visual treatment**
- Add black redaction bars partially obscuring the item name (CSS pseudo-elements with `bg-white/90` blocks over portions of text) — makes it feel like classified intelligence.
- The label area (currently just faint text) becomes a layered composition: a subtle blurred/ghosted product silhouette behind redaction marks.

**3. Animated scan-line + flicker on hover**
- On hover, the card gets a horizontal scan-line sweep (a thin bright line animating top-to-bottom) as if being "scanned" or "detected."
- A brief screen-flicker/glitch on the card border (reusing the existing `warningGlitch` keyframes) to make it feel like the system is reacting to your attention.

**4. Status indicators with pulsing dots**
Replace plain text statuses with a small colored dot (red = restricted, amber = reformed, grey = disappeared) that gently pulses, paired with the status label — makes the cards feel alive and monitored.

**5. "Request Access" button upgrade**
- Add a small lock icon before the text.
- On hover, the button border glitches red and the text shifts to "SUBMIT REQUEST ›" — adds tension and interactivity.

**6. Card border glow on hover**
A subtle red glow (`box-shadow: 0 0 20px rgba(239,68,68,0.15)`) on hover to make each card feel like a hot/dangerous item being highlighted.

### Technical Details

**Files modified:** `src/pages/World.tsx`, `src/index.css`

- **World.tsx**: Update `contrabandDrops` data array with richer fields. Rebuild card markup with redaction bars, pulsing status dots, scan-line overlay div, lock icon on button.
- **index.css**: Add `@keyframes scanLine` (translateY sweep), `.contraband-card:hover` glow styles, `.redact-bar` utility class, and pulsing dot animation.

All animations use CSS only — no new dependencies. The glitch effects reuse the existing `warningGlitch` keyframe pattern already in the codebase.

