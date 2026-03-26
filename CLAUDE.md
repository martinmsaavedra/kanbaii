# KANBAII — Project Instructions

## Overview
AI-native kanban board for software development. NPM package, no Docker. JSON persistence, Express + Socket.IO backend, Next.js 14 frontend.

## Architecture

**Hierarchy**: Project → Work Items (Feature/Bug/Refactor) → Tasks (5-column kanban)

- **Backend**: Express + Socket.IO (single port 5555)
- **Frontend**: Next.js 14 static export, served by Express
- **Data**: JSON files in `data/projects/`
- **CLI**: `kanbaii start|init|stop|status`

## Data Structure

```
data/projects/{slug}/
  project.json              # Project metadata
  work-items/{wi-slug}.json # Work item: plan + columns + tasks
  soul/                     # Soul system per project
```

## Key Files

| File | Purpose |
|------|---------|
| `src/server/index.ts` | Express + Socket.IO entry |
| `src/server/services/projectStore.ts` | Project CRUD (JSON) |
| `src/server/services/workItemStore.ts` | Work Item CRUD (JSON) |
| `src/server/lib/typedEmit.ts` | Socket.IO typed wrapper |
| `src/server/engines/ralph.ts` | Single work item executor |
| `src/server/engines/teams.ts` | Multi work item executor |
| `src/cli/index.ts` | CLI entry point |
| `frontend/src/app/page.tsx` | Frontend entry |
| `frontend/src/components/WorkItemsBoard.tsx` | Work items kanban |
| `frontend/src/components/TaskBoard.tsx` | Per-work-item task kanban |

## Categories (Hardcoded)

| Category | Color | Prefix |
|----------|-------|--------|
| Feature | `#6366f1` indigo | `feat-` |
| Bug | `#ef4444` red | `bug-` |
| Refactor | `#f59e0b` amber | `ref-` |

## Work Item Status (Kanban columns)

`planning` → `active` → `review` → `done`

## Task Columns

`Backlog` → `Todo` → `In Progress` → `Review` → `Done`

## Design System

- Background: `#0a0a0b`
- Accent: `#6366f1` (indigo)
- Font: Inter
- Aesthetic: dark, minimalist, futuristic
- **Design & UX are top priority** — every interaction must feel fluid and professional

## Development

```bash
# Start dev (backend + frontend separately)
npm run dev:server    # Express on :5555
npm run dev:frontend  # Next.js on :3000 (proxy to 5555)

# Build
npm run build

# Test
npm test

# Production
npm start             # Serves everything on :5555
```

## Git Strategy — Trunk-Based

```
main ← trunk. Direct push. No feature branches unless experimental.
```

### Commit format
```
feat(scope): description
fix(scope): description
refactor(scope): description
```

### Rules
- Never `git add .` or `git add -A` — specific files only
- Never commit `.env`, `data/`, `node_modules/`
- Run `npm test` before push
- Never force push

## Testing

- Framework: Vitest
- Unit tests: `src/server/__tests__/`
- Frontend tests: `frontend/src/__tests__/`
- Run before push: `npm test`

## NPM Package

- Name: `kanbaii`
- Bin: `kanbaii` → `dist/cli/index.js`
- Includes: `dist/` (server+CLI) + `dashboard/` (frontend build)
- Single port serves API + static frontend
