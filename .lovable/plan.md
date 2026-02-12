

## Plan: Create Environment Files

### What We'll Do

Create two environment files at the project root with a `VITE_BASE_URL` variable:

**1. `.env.development`**
```
VITE_BASE_URL=https://guilty-dev-829ae.ts.r.appspot.com
```

**2. `.env.production`**
```
VITE_BASE_URL=https://guilty-dev-829ae.ts.r.appspot.com
```

### How It Works

- Vite automatically loads `.env.development` during `vite dev` and `.env.production` during `vite build`
- The variable is accessible in code via `import.meta.env.VITE_BASE_URL`
- The `VITE_` prefix is required for Vite to expose the variable to client-side code

