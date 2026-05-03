# Vite+ Full-Stack Template

Vite+ monorepo template with these defaults:

- `apps/website`: Vite frontend
- `apps/backend`: Hono on Cloudflare Workers
- `packages/contract`: shared oRPC contract

## Structure

```txt
apps/
  backend/
  website/
packages/
  contract/
```

## Development

Install dependencies:

```bash
vp install
```

Run frontend and backend together with Vite+ parallel mode:

```bash
vp run dev
```

The frontend runs on `http://127.0.0.1:5173` and proxies `/api` and `/rpc` to the Hono dev server on `http://127.0.0.1:8787`.

## Quality Checks

```bash
vp run format
vp run lint
vp run typecheck
vp run test
```

## Build

```bash
vp run build
```

This builds `apps/website/dist`, which is used by Cloudflare Workers Assets.

## Deploy

```bash
vp run deploy
```

Deployment uses Cloudflare Workers Assets so the worker serves the built frontend while Hono handles `/api/*` and `/rpc/*`.
