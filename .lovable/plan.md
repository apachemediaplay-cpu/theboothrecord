

## World Page Restructure — Brand Experience

### New Section Order

1. **Hero** — Keep existing full-screen hero image with logo, but update copy to be brand-focused rather than product/wholesale-focused. Shift messaging from "A soda built for bars..." to something more atmospheric like "Indulgence has a name."

2. **The Drinks (Flavour Block)** — Move directly under hero. Keep the three flavour cards with alternating layout. Remove the "Product Statement", "Lineup Image", and "Product Overview" sections that currently sit between hero and flavours — they're too corporate.

3. **Venues (Context Gallery + Origin)** — Combine the context images gallery with atmospheric copy about where GUILTY lives. Bars, late nights, places that don't explain themselves. Use the existing context images.

4. **Contraband** — New section. Limited drops, restricted material outside the main range. Messaging: "Some are monitored. Some are reformed. Some quietly disappear." Placeholder cards for future drops with a locked/restricted aesthetic. Dark background, feels exclusive.

5. **Confessional** — New section. A glimpse into the confession experience. Pull visual elements from TheWall (scan lines, blurred verdicts) and the confession booth (dark atmosphere). Show a few real confession snippets from the API with blurred verdicts, and a prominent CTA button linking to `/confess`. Moody, immersive.

6. **Footer** — Keep existing minimal footer with red logo.

### What Gets Removed
- Product Statement section (too corporate)
- Product Overview bullet list (too pitch-deck)
- Retail Positioning section (stays on /retail)
- Retail Enquiry Block (stays on /retail)
- Expression of Interest Form (stays on /retail)
- Sticky CTA banner (stays on /retail)
- RetailEarlyAccessModal import and usage

### Technical Details

**File changed:** `src/pages/World.tsx` only.

- Remove `form` state, `handleChange`, `handleSubmit`, `submitted`, `ctaDismissed`, `modalOpen` state — all wholesale/retail form logic.
- Remove `RetailEarlyAccessModal` import and component.
- Remove `productPoints`, `retailPoints` data arrays.
- Add a `useEffect` to fetch a few confessions from the API (`VITE_BASE_URL/v1/confessions`) for the Confessional preview section (reuse the same pattern from TheWall).
- **Contraband section**: Static placeholder content with 2-3 "drop" cards styled as locked/redacted items. Dark bg, border styling, "CLASSIFIED" or "RESTRICTED" labels.
- **Confessional section**: Dark section with scan-line overlay effect, 2-3 confession snippets with blurred verdicts (reuse `ConfessionCard` or simplified version), and a "Enter the Booth" button linking to `/confess`.
- Reorder JSX sections to match the new flow.

