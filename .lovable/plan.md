

## Simplify DROP-002 Card

The card currently has too many text elements stacked: a tagline, individual drink listings with flavour notes, a pricing breakdown section, an italic quote, and trust badges. This creates visual clutter.

### What changes

Strip the card down to just the essentials for a premium purchase card:

1. **Remove** the descriptive paragraph ("One of each. Twice...") — unnecessary copy
2. **Simplify the drink list** to a single compact line per drink (just name, no flavour description) with a subtle separator style, or collapse into one line like "3 × 250ml each · Citrus Confessional · Bitter Justice · Cola Vice"
3. **Remove** the italic quote ("Against your better judgement...")
4. **Remove** the "Free shipping · Limited to 1,000 issues" line — the "LIMITED TO 1,000" is already stated at the top
5. **Remove** the "SECURE CHECKOUT · SHIPS WORLDWIDE" footer text
6. **Keep** the video, DROP-002 heading, limited edition subtitle, price, and Order Now button

### Result

The card will contain only:
- Full-bleed video
- "DROP–002" title + "LIMITED TO 1,000 · NO RESTOCK"
- A minimal single-line drink summary (e.g. "6 × 250ml · 3 blends")
- Price ($80) with clean layout
- "Order Now — $80" button

This gives a cleaner, fashion-drop aesthetic with breathing room.

### Technical detail

Edit `src/pages/Home.tsx` lines 624–673, removing ~20 lines of text content and consolidating the drink info into a minimal format.

