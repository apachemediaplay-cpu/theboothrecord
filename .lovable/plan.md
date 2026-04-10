

## Update Can Product Images

The uploaded images map directly to existing assets in `src/assets/retail/`:

| Uploaded file | Replaces |
|---|---|
| `Yuzu_2.png` | `src/assets/retail/citrus-confessional.png` |
| `Bitter.png` | `src/assets/retail/bitter-justice.png` |
| `Cola.png` | `src/assets/retail/cola-vice.png` |

These images are imported in three pages: `Home.tsx`, `Retail.tsx`, and `World.tsx`. Since the filenames stay the same, no code changes are needed — just replacing the image files.

### Steps
1. Copy `user-uploads://Yuzu_2.png` to `src/assets/retail/citrus-confessional.png`
2. Copy `user-uploads://Bitter.png` to `src/assets/retail/bitter-justice.png`
3. Copy `user-uploads://Cola.png` to `src/assets/retail/cola-vice.png`

No code edits required. The existing imports will pick up the new images automatically.

