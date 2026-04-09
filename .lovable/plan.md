

## Split DROP-002 Headline into Two Lines

**What changes:**  
In `src/pages/Home.tsx` (lines 614–616), replace the single `<h3>` with:
- `<h3>` containing just "DROP–002" — large, bold headline (`text-xl md:text-2xl`)
- `<p>` beneath it with "LIMITED TO 1,000 · NO RESTOCK" — smaller subline (`text-[10px] tracking-[0.25em]`, neutral-500 color)
- Small gap between them (`mb-1` on the h3, `mb-4` on the subline)

Single file edit, ~5 lines changed.

