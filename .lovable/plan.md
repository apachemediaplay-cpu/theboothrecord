

## Make Background Confession Stream More Visible

**What changes:** Increase the opacity of the background scrolling confession stream in the Confessional section from `opacity-[0.06]` to `opacity-[0.12]`.

**Technical detail:**
- **File:** `src/pages/World.tsx`, line 565
- Change `opacity-[0.06]` to `opacity-[0.12]` on the background confession stream container

This doubles the visibility while keeping it subtle enough not to compete with the foreground content.

