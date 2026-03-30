<p align="center">
  <img src="https://img.shields.io/npm/v/kanbaii?style=for-the-badge&color=6366f1&labelColor=0a0a0b" alt="npm version" />
  <img src="https://img.shields.io/npm/dw/kanbaii?style=for-the-badge&color=22c55e&labelColor=0a0a0b" alt="downloads" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-22c55e?style=for-the-badge&labelColor=0a0a0b" alt="Node" />
  <img src="https://img.shields.io/badge/license-MIT-71717a?style=for-the-badge&labelColor=0a0a0b" alt="License" />
</p>

<h1 align="center">
  <br />
  ◈ KANBAII
  <br />
</h1>

<p align="center">
  <strong>Visual cockpit for Claude Code.</strong>
  <br />
  <sub>Same engine. Better cockpit. Plan visually, track progress, let AI execute.</sub>
</p>

<p align="center">
  <a href="#the-problem">The Problem</a> ·
  <a href="#30-second-start">30-Second Start</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#when-to-use-what">When To Use What</a> ·
  <a href="#features">Features</a> ·
  <a href="#cli-reference">CLI</a>
</p>

---

## Why KANBAII

**Claude Code is the engine. KANBAII is the cockpit.**

You can manage a project from the terminal. But when your project has 15 features, 8 bugs, and 3 refactors — opening a browser and seeing everything as a kanban board, dragging priorities, reading plans, and launching agents that work your backlog — that's a different experience.

KANBAII is a visual kanban board that sits on top of Claude Code. Organize your work visually, plan with AI, and when you're ready — hit play and watch your agents execute.

> Same engine. Better cockpit.

---

## 30-Second Start

**Prerequisites:** [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated.

```bash
# Install
npm install -g kanbaii

# Verify everything works
kanbaii doctor

# Launch — opens in your browser
kanbaii start
```

That's it. Your board is at `localhost:5555`. Data stays on your machine as clean JSON files.

---

## How It Works

### 1. Organize in two levels

```
Project (your big goal)
  └── Work Items (Feature / Bug / Refactor)
        ├── Plan (context, strategy, notes)
        └── Tasks (5-column kanban board)
```

**Work Items** are the meaningful chunks. Each one gets its own kanban board with `Backlog → Todo → In Progress → Review → Done`.

### 2. Plan with AI (or manually)

Open the **Planner** — describe what you want in plain language:

> "I need user auth with login, signup, password reset, and OAuth for Google & GitHub"

AI generates structured work items with plans and tasks. Review, edit, approve. Or skip the AI and create everything manually — your call.

### 3. Execute

Three modes, pick what fits:

| Mode | What it does | When to use |
|------|-------------|-------------|
| **Manual** | You drag tasks across columns | When you're doing the work yourself |
| **Ralph** | AI executes one work item end-to-end | Focused, sequential work |
| **Teams** | AI coordinator runs multiple work items in parallel | Sprint-style, multiple fronts at once |

Ralph reads the plan, resolves dependencies, executes tasks in order, and moves them to Review. Teams does the same — but with multiple workers, simultaneously.

---

## When To Use What

This is the key question. Here's the honest answer:

```
                         ┌─────────────────────────────┐
  "Fix this one bug"     │                             │
  "Refactor this func"   │     Claude Code directly     │
  "Explain this code"    │     (terminal, one task)     │
  "Write tests for X"    │                             │
                         └─────────────────────────────┘

                         ┌─────────────────────────────┐
  "Build auth system"    │                             │
  "8 bugs to triage"     │         KANBAII              │
  "MVP with 15 features" │   (board + AI execution)    │
  "Track sprint progress" │                             │
                         └─────────────────────────────┘
```

**The rule:** if you can describe it in one sentence → Claude Code. If you need a list → KANBAII.

They're not competing tools. KANBAII calls Claude Code under the hood. It's the **project layer** that makes Claude Code work across many tasks instead of one at a time.

---

## Features

### Visual Kanban Board
Two-level board with drag & drop. Work items flow through `Planning → Active → Review → Done`. Tasks inside each work item flow through 5 columns. Real-time updates via Socket.IO.

### AI Planner
Describe what you need in natural language. AI generates work items with full plans and decomposed tasks. Review and approve before anything hits your board.

### Ralph — Focused Executor
One work item, full attention. Reads the plan, picks up tasks from Todo, executes them sequentially (parallel where safe), moves completed work to Review. Pauses and asks you when it needs input.

### Teams — Parallel Execution
Select multiple work items. A coordinator assigns each to a worker. Workers execute simultaneously — one work item per worker. Watch progress from the Teams dashboard.

### Local-First, Zero Config
No accounts. No subscriptions. No cloud. Your data is JSON files on disk. Fully git-friendly. Stop the server and your data is still there, readable, portable.

### Developer Experience
- **Command Palette** (`Ctrl+K`) for fast navigation
- **Keyboard-first** — everything accessible without a mouse
- **Dark & Light themes** — Obsidian dark mode, Porcelain light mode
- **Doctor command** — validates Claude CLI, auth, Node.js, everything

---

## Data Structure

No database. Clean JSON files you can read, edit, and version control:

```
data/projects/my-app/
  project.json                    # Project metadata
  work-items/
    feat-auth-system.json         # Feature with plan + tasks
    bug-login-crash.json          # Bug with plan + tasks
```

---

## CLI Reference

```bash
kanbaii start              # Start server, open browser
kanbaii start -p 8080      # Custom port
kanbaii start --no-open    # Don't open browser
kanbaii start --data-dir ~/my-data  # Custom data directory
kanbaii doctor             # Diagnose: Claude CLI, Node, auth
kanbaii status             # Is the server running?
kanbaii init               # Initialize data directory
```

---

## Architecture

For contributors:

```
Express + Socket.IO ──── Single port (default: 5555)
       │
       ├── /api/*          REST endpoints
       ├── /socket.io      Real-time events
       └── /*               Static frontend (Next.js export)
```

| Layer | Stack |
|-------|-------|
| Backend | Express, Socket.IO, Zod |
| Frontend | Next.js 14, Zustand, Framer Motion |
| AI | Claude Code CLI |
| Testing | Vitest |

```bash
git clone https://github.com/martinmsaavedra/kanbaii.git
cd kanbaii && npm install
cd frontend && npm install && cd ..

npm run dev:server    # Express on :5555
npm run dev:frontend  # Next.js on :3000
npm test
```

---

## Philosophy

> **Structure without ceremony. AI without lock-in. Your data, your machine.**

- Your board is a JSON folder, not a vendor database
- Claude Code does the real work — KANBAII just gives it structure
- No accounts, no cloud, no tracking — install and go
- Organization is the multiplier — not more AI, but better-directed AI

---

## Support

If you find KANBAII useful, consider giving it a star on GitHub — it helps others discover the project.

[![Star on GitHub](https://img.shields.io/github/stars/martinmsaavedra/kanbaii?style=social)](https://github.com/martinmsaavedra/kanbaii)

---

<p align="center">
  <sub>Built by <a href="https://github.com/martinmsaavedra">Martin Saavedra</a></sub>
  <br />
  <sub>Powered by <a href="https://anthropic.com">Claude</a> · MIT License</sub>
</p>
