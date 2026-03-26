<p align="center">
  <img src="https://img.shields.io/badge/kanbaii-v0.1.0-6366f1?style=for-the-badge&labelColor=0a0a0b" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-22c55e?style=for-the-badge&labelColor=0a0a0b" alt="Node" />
  <img src="https://img.shields.io/badge/license-MIT-71717a?style=for-the-badge&labelColor=0a0a0b" alt="License" />
  <img src="https://img.shields.io/badge/AI-Claude-f59e0b?style=for-the-badge&labelColor=0a0a0b" alt="Claude AI" />
</p>

<h1 align="center">
  <br />
  ◈ KANBAII
  <br />
</h1>

<p align="center">
  <strong>AI-native project management for developers who ship.</strong>
  <br />
  <sub>Hierarchical kanban · Claude AI integration · Zero config · Runs locally</sub>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#wizard">Wizard</a> ·
  <a href="#ralph--teams">Ralph & Teams</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

## The Problem

You have a feature to build. You open your project management tool. You create 15 flat tasks. By day 3, they're a mess — bugs mixed with features, no hierarchy, no context, no plan. Your AI assistant reads 50K chars of instructions just to know where things stand.

**Software isn't flat. Your kanban shouldn't be either.**

## The Solution

KANBAII organizes work the way developers actually think:

```
Project
  └── Work Items (Features, Bugs, Refactors)
        ├── Plan (generated or manual)
        └── Tasks (5-column kanban per work item)
```

Each work item gets its own board. Each board has its own context. Your AI agents execute with precision because they only see what matters.

---

## Quick Start

```bash
npx kanbaii
```

That's it. Opens in your browser. No Docker. No database. No config files. Just JSON on disk.

```bash
# Or install globally
npm install -g kanbaii
kanbaii start
```

---

## Features

### ◈ Hierarchical Kanban

Two levels of kanban boards:

- **Level 1** — Work Items Board: drag Features, Bugs, and Refactors across `Planning → Active → Review → Done`
- **Level 2** — Task Board: each work item has its own `Backlog → Todo → In Progress → Review → Done`

### ✦ Three Work Item Types

| Type | Purpose | Color |
|------|---------|-------|
| **Feature** | New functionality | Indigo |
| **Bug** | Fix a defect | Red |
| **Refactor** | Improve existing code | Amber |

Bugs and Refactors can link to a Feature for shared context.

### ⚡ AI Wizard

Create a work item in seconds:

1. Pick a category (Feature / Bug / Refactor)
2. Link to an existing feature (optional)
3. Describe what you need in plain English
4. Claude generates a plan → you approve
5. Claude generates tasks from the plan → you approve
6. Done. Your kanban is populated and ready to execute.

Skip any step. Create everything manually if you prefer. The wizard accelerates — it never blocks.

### 🤖 Ralph — AI Executor

Select a work item. Ralph executes every task in order, respecting dependencies and parallelizing where possible.

```
Ralph picks work item "Auth System"
  → Reads plan for context
  → Resolves task dependencies
  → Executes tasks (parallel where safe)
  → Moves completed tasks to Review
  → Reports back with summaries
```

### 👥 Teams — Multi-Agent Execution

Select multiple work items. The coordinator assigns each to a worker. Workers execute in parallel — one work item per worker.

### 🎯 Zero-Friction UX

- Dark theme, minimalist design, fluid animations
- Drag & drop at both levels
- Progress bars on every work item card
- Click to drill in, breadcrumb to navigate back
- Keyboard shortcuts for power users
- Real-time updates via WebSocket

### 📁 JSON Persistence

No database. No markdown parsing. Clean JSON files on disk, git-friendly:

```
data/projects/my-project/
  project.json
  work-items/
    feat-auth-system.json
    bug-login-crash.json
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  KANBAII                                                │
│                                                         │
│  ┌──────────┐  ┌────────────────────────────────────┐  │
│  │ Sidebar  │  │  Work Items Board                  │  │
│  │          │  │                                     │  │
│  │ Projects │  │  PLANNING    ACTIVE    REVIEW  DONE │  │
│  │ ● Auth   │  │  ┌──────┐  ┌──────┐                │  │
│  │ ○ API    │  │  │ feat │  │ feat │                │  │
│  │ ○ UI     │  │  └──────┘  ├──────┤                │  │
│  │          │  │            │ bug  │                │  │
│  │          │  │            └──────┘                │  │
│  └──────────┘  └────────────────────────────────────┘  │
│                                                         │
│  Click a work item → enters its Task Board:            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  ← Back   ✦ Auth System   ████░░ 5/8            │  │
│  │                                                   │  │
│  │  BACKLOG   TODO   IN PROGRESS   REVIEW   DONE    │  │
│  │  ┌──────┐ ┌────┐ ┌──────────┐ ┌──────┐ ┌─────┐ │  │
│  │  │ task │ │task│ │   task   │ │ task │ │task │ │  │
│  │  └──────┘ │    │ └──────────┘ └──────┘ └─────┘ │  │
│  │           └────┘                                 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Architecture

```
Express + Socket.IO ──── Single port (default: 5555)
       │
       ├── /api/*          REST endpoints
       ├── /socket.io      Real-time events
       └── /*               Static frontend (Next.js export)
```

| Component | Technology |
|-----------|-----------|
| Backend | Express 4 + Socket.IO 4 |
| Frontend | Next.js 14 (static export) |
| State | Zustand |
| Drag & Drop | @atlaskit/pragmatic-drag-and-drop |
| Animations | Framer Motion |
| AI Engine | Claude CLI |
| CLI | Commander.js |
| Validation | Zod |
| Testing | Vitest |

**No Docker. No database. No external services.**

Everything runs locally. Your data stays on your machine.

---

## Configuration

```bash
# Initialize with custom settings
kanbaii init --port 8080 --data ~/my-projects

# Or just run — defaults work great
kanbaii start
```

| Setting | Default | Description |
|---------|---------|-------------|
| `port` | `5555` | Server port |
| `dataDir` | `~/.kanbaii/data` | Where project JSON lives |
| `openBrowser` | `true` | Auto-open on start |

---

## CLI

```bash
kanbaii start          # Start the server
kanbaii stop           # Graceful shutdown
kanbaii status         # Health check
kanbaii init           # Initialize data directory
```

---

## Roadmap

- [x] Project scaffold & architecture
- [x] Design system & wireframes
- [ ] Data layer (JSON stores, Zod validation)
- [ ] REST API + Socket.IO server
- [ ] Frontend shell (sidebar, routing, design system)
- [ ] Work Items Board (4-column kanban)
- [ ] Task Board (5-column kanban per work item)
- [ ] AI Wizard (prompt → plan → tasks)
- [ ] Ralph (single work item executor)
- [ ] Teams (multi work item coordinator)
- [ ] Terminal integration
- [ ] Scheduler
- [ ] NPM package release

---

## Development

```bash
# Clone
git clone https://github.com/martinmsaavedra/kanbaii.git
cd kanbaii

# Install
npm install
cd frontend && npm install && cd ..

# Dev mode (backend + frontend)
npm run dev

# Test
npm test

# Build
npm run build
```

---

## Philosophy

> Ship fast. Stay organized. Let AI handle the grunt work.

KANBAII is built for developers who:
- Want structure without ceremony
- Prefer local tools over SaaS subscriptions
- Trust AI to execute but want to stay in control
- Value clean UX as much as clean code

---

<p align="center">
  <sub>Built by <a href="https://github.com/martinmsaavedra">Martín Saavedra</a></sub>
  <br />
  <sub>Powered by <a href="https://anthropic.com">Claude</a> · Licensed under MIT</sub>
</p>
