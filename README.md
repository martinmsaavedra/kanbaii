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
  <strong>Your ideas deserve structure. AI gives them momentum.</strong>
  <br />
  <sub>For creators, founders, students, teams, and anyone with a plan to execute.</sub>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#who-is-it-for">Who Is It For</a> ·
  <a href="#concepts">Concepts</a> ·
  <a href="#wizard">Wizard</a> ·
  <a href="#ralph--teams">Ralph & Teams</a> ·
  <a href="#cli">CLI</a>
</p>

---

## What Is KANBAII

A local-first project board powered by AI. No accounts, no subscriptions, no cloud. Install it, open it, organize anything — from a product launch to a thesis, from a startup MVP to a home renovation plan.

KANBAII gives you structure when you need it and an AI that can actually execute work for you.

```bash
npx kanbaii
```

That's it. Opens in your browser.

---

## Who Is It For

**Everyone.** You don't need to be a programmer.

| You are... | KANBAII helps you... |
|---|---|
| A **founder** with 10 ideas and no process | Break each idea into clear steps and prioritize |
| A **student** planning a thesis or project | Turn a vague goal into a structured plan with tasks |
| A **freelancer** juggling clients | Separate projects, track what's active, what's done |
| A **developer** building software | Execute tasks with AI agents that write code for you |
| A **team lead** coordinating work | Run multiple work streams in parallel with Teams |
| A **creator** launching something | Plan, track, and ship — without spreadsheet chaos |

If you've ever felt overwhelmed by everything you need to do, KANBAII turns that noise into a clear board.

---

## Quick Start

```bash
# Run instantly (no install needed)
npx kanbaii

# Or install globally
npm install -g kanbaii
kanbaii start
```

No Docker. No database. No config files. Just JSON on your machine.

---

## Concepts

### The Hierarchy

KANBAII organizes work in two levels:

```
Project (your big goal)
  └── Work Items (the pieces to build)
        ├── Plan (context, strategy, notes)
        └── Tasks (concrete steps on a kanban board)
```

**Work Items** are the meaningful chunks: a feature to build, a bug to fix, a section to refactor. Each one gets its own 5-column kanban board.

### Work Item Types

| Type | When to use | Color |
|------|------------|-------|
| **Feature** | Something new to create | Indigo |
| **Bug** | Something broken to fix | Red |
| **Refactor** | Something existing to improve | Amber |

### Two Levels of Kanban

- **Level 1 — Work Items Board**: Drag work items across `Planning → Active → Review → Done`
- **Level 2 — Task Board**: Each work item has its own `Backlog → Todo → In Progress → Review → Done`

Click a work item to enter its board. Breadcrumb to navigate back. Simple.

---

## Wizard

The AI wizard turns a sentence into a structured plan:

1. Pick a type (Feature / Bug / Refactor)
2. Describe what you need in plain language
3. AI generates a plan — you review and approve
4. AI generates tasks from the plan — you review and approve
5. Your board is populated and ready

Skip any step. Edit anything. The wizard accelerates — it never locks you in.

---

## Ralph & Teams

### Ralph — Single Executor

Select one work item. Ralph handles it end to end:

- Reads the plan for context
- Resolves task dependencies
- Executes tasks in order (parallel where safe)
- Moves completed work to Review
- Reports back with summaries

**Think of Ralph as a focused assistant** — one work item, full attention.

### Teams — Parallel Execution

Select multiple work items. A coordinator assigns each to a worker. Workers execute simultaneously — one work item per worker.

**Think of Teams as a squad** — multiple work items, all moving at once.

---

## CLI

```bash
kanbaii start          # Start the server
kanbaii stop           # Graceful shutdown
kanbaii status         # Health check
kanbaii init           # Initialize data directory
```

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `port` | `5555` | Server port |
| `dataDir` | `~/.kanbaii/data` | Where project data lives |
| `openBrowser` | `true` | Auto-open on start |

```bash
kanbaii init --port 8080 --data ~/my-projects
```

---

## How Data Works

No database. Clean JSON files on disk, fully git-friendly:

```
data/projects/my-project/
  project.json
  work-items/
    feat-auth-system.json
    bug-login-crash.json
```

Your data stays on your machine. Always.

---

## Architecture

For contributors and the curious:

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

---

## Development

```bash
git clone https://github.com/martinmsaavedra/kanbaii.git
cd kanbaii

npm install
cd frontend && npm install && cd ..

# Dev mode
npm run dev:server    # Express on :5555
npm run dev:frontend  # Next.js on :3000

# Test
npm test

# Build
npm run build
```

---

## Philosophy

> Structure without ceremony. AI without lock-in. Your data, your machine.

KANBAII is for anyone who wants to:
- Turn ideas into action without overthinking the process
- Stay organized without paying for another SaaS
- Let AI do the heavy lifting while you stay in control
- Work locally, own your data, move fast

---

<p align="center">
  <sub>Built by <a href="https://github.com/martinmsaavedra">Martín Saavedra</a></sub>
  <br />
  <sub>Powered by <a href="https://anthropic.com">Claude</a> · Licensed under MIT</sub>
</p>
