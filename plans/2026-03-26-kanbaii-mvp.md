# Plan: KANBAII — MVP desde cero

**Fecha**: 2026-03-26
**Origen**: Refactorización completa de agency-kanban → nuevo producto NPM
**Autor**: Martín + Claude

---

## Visión

KANBAII es un tablero kanban AI-native para desarrollo de software. Se instala con `npx kanbaii` y corre localmente. Sin Docker, sin base de datos — solo JSON files y un servidor Express.

La diferencia clave vs agency-kanban: **jerarquía de dos niveles**. Un proyecto contiene work items (Features, Bugs, Refactors), y cada work item tiene su propio kanban board de 5 columnas con tareas.

## Decisiones de Arquitectura

### Lo que cambia vs agency-kanban

| Aspecto | agency-kanban | KANBAII |
|---------|--------------|---------|
| Persistencia | Markdown + YAML frontmatter | JSON |
| Modelo de datos | Proyecto → Tareas (plano) | Proyecto → Work Items → Tareas |
| External sync | Bidireccional TASKS.md | Eliminado. Todo centralizado |
| Docker | Requerido (dev) | Eliminado. NPM puro |
| Parser | markdownParser.ts (600+ líneas) | JSON.parse() nativo |
| Categorías | Tags libres | 3 hardcoded: Feature, Bug, Refactor |
| Ejecución | Ralph toma tareas de 1 proyecto | Ralph toma 1 work item. Teams toma N work items |
| Wizard | No existe | Prompt → Plan → Tasks (Claude-assisted) |
| Soul | Por proyecto | Por proyecto (sin cambios) |

### Lo que se porta directamente

- Express + Socket.IO server setup
- typedEmit + socket event types
- RunStore (state machine + AsyncMutex)
- Claude runner (spawn CLI)
- Terminal system (PTY sessions)
- Agent system (taskRouter, registry, coordinator)
- Auth system (JWT + bcrypt)
- Design system (dark theme, Inter, indigo accent)
- Zustand store patterns

### Lo que se elimina

- markdownParser.ts / markdownSerializer.ts
- externalTasksParser.ts / externalTasksSerializer.ts
- externalWatcher.ts
- projectIO.ts (done file split logic)
- Formato Fase/spec-kit parsing
- Docker compose, Dockerfile
- runner-manager.js / scheduler-runner.js
- 60%+ del CLAUDE.md actual

---

## Data Model

### Estructura de archivos

```
~/.kanbaii/                     # Config dir (NPM mode)
  config.json                   # User settings

data/projects/                  # Default (configurable)
  {project-slug}/
    project.json                # Project metadata
    work-items/
      {wi-slug}.json            # Work item: plan + columns + tasks
    soul/
      SOUL.md
      HEALTH.md
```

### project.json

```json
{
  "id": "my-project-a7f2",
  "slug": "my-project",
  "title": "My Project",
  "description": "Project description",
  "color": "#6366f1",
  "status": "active",
  "createdAt": "2026-03-26T00:00:00Z",
  "updatedAt": "2026-03-26T00:00:00Z"
}
```

### work-item JSON ({wi-slug}.json)

```json
{
  "id": "feat-auth-system-a7f2",
  "slug": "feat-auth-system",
  "title": "Auth System",
  "category": "feature",
  "status": "active",
  "linkedWorkItem": null,
  "plan": {
    "prompt": "I need JWT auth with bcrypt password hashing",
    "content": "## Auth System Plan\n\n### Objective\nImplement secure authentication...\n\n### Steps\n1. Setup bcrypt...\n2. JWT generation...",
    "status": "approved",
    "generatedBy": "claude",
    "createdAt": "2026-03-26T00:00:00Z",
    "updatedAt": "2026-03-26T00:00:00Z"
  },
  "columns": {
    "backlog": [
      {
        "id": "research-jwt-libs-c3d4",
        "title": "Research JWT libraries",
        "description": "Compare jsonwebtoken vs jose",
        "completed": false,
        "model": "sonnet",
        "priority": "medium",
        "tags": ["research"],
        "agent": null,
        "depends": [],
        "createdAt": "2026-03-26T00:00:00Z"
      }
    ],
    "todo": [],
    "in-progress": [],
    "review": [],
    "done": []
  },
  "createdAt": "2026-03-26T00:00:00Z",
  "updatedAt": "2026-03-26T00:00:00Z"
}
```

### Categorías (hardcoded)

| Categoría | Color | Icono | Prefijo slug |
|-----------|-------|-------|-------------|
| Feature | `#6366f1` (indigo) | `✦` sparkle | `feat-` |
| Bug | `#ef4444` (red) | `●` circle | `bug-` |
| Refactor | `#f59e0b` (amber) | `◆` diamond | `ref-` |

### Vinculación Bug/Refactor → Feature

```json
{
  "category": "bug",
  "linkedWorkItem": "feat-auth-system-a7f2",
  ...
}
```

Cuando `linkedWorkItem` está definido, el wizard recibe un resumen del work item vinculado como contexto adicional para generar plan y tareas. En la UI se muestra como badge "→ Auth System" en el work item card.

### Task type

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  model: 'opus' | 'sonnet' | 'haiku';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  agent?: string;
  depends?: string[];
  due?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  output?: string;
  summary?: TaskSummary;
}
```

### Work Item Status (columnas del kanban de work items)

| Status | Significado |
|--------|-------------|
| `planning` | Plan en creación/revisión |
| `active` | En desarrollo (tiene tareas en todo/in-progress) |
| `review` | Todas las tareas completadas, pendiente de revisión |
| `done` | Completado |

---

## Navegación UX

### Flow principal

```
Sidebar (proyectos)
  → Click proyecto
    → Work Items Board (kanban: Planning | Active | Review | Done)
      → Click work item card
        → Task Board (5 columnas: Backlog | Todo | In Progress | Review | Done)
          → Click task → Task Modal
```

### Work Items Board

Vista principal al seleccionar un proyecto. Kanban de 4 columnas:

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Planning   │ │   Active    │ │   Review    │ │    Done     │
│             │ │             │ │             │ │             │
│ ┌─────────┐ │ │ ┌─────────┐ │ │             │ │             │
│ │ ✦ Auth  │ │ │ │ ● Login │ │ │             │ │             │
│ │ Feature │ │ │ │ Bug     │ │ │             │ │             │
│ │ ░░░░░░░ │ │ │ │ ████░░░ │ │ │             │ │             │
│ │ 0/5     │ │ │ │ 3/7     │ │ │             │ │             │
│ │ → Auth  │ │ │ └─────────┘ │ │             │ │             │
│ └─────────┘ │ │             │ │             │ │             │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

Cada work item card muestra:
- **Icono de categoría** + color (Feature indigo, Bug red, Refactor amber)
- **Título** del work item
- **Barra de progreso** (tareas completadas / total)
- **Contador** de tareas por estado
- **Badge de vinculación** si es bug/refactor linked a un feature
- **Modelo principal** (el más usado en sus tareas)

### Acciones en Work Items Board

- **"+ New"** botón por columna → Wizard modal o creación manual
- **Drag & drop** work items entre columnas
- **Click** en card → entra al Task Board del work item
- **Breadcrumb**: `Proyecto > Work Items > [nombre]` para navegación

### Task Board (per work item)

Idéntico al board actual de agency-kanban pero scoped a un solo work item. Header muestra:
- Nombre del work item + categoría badge
- Botón "← Back" o breadcrumb para volver
- Botón "View Plan" (expandible) para ver el plan del work item
- Progreso general

---

## Wizard Flow

### Creación de Work Item

**Step 1: Categoría**
3 botones grandes: Feature | Bug | Refactor. Click para seleccionar.

**Step 2: Contexto** (solo para Bug/Refactor)
Selector de work item existente para vincular (opcional). Auto-carga resumen.

**Step 3: Prompt**
Textarea. El usuario describe qué quiere. Ejemplos placeholder según categoría.

**Step 4: Plan** (generado por Claude)
Claude genera plan basado en prompt + contexto del proyecto. El usuario puede:
- Aprobar → Step 5
- Editar manualmente → re-submit
- Regenerar con instrucciones adicionales

**Step 5: Tasks** (generadas por Claude)
Claude genera tareas del plan aprobado. Output: JSON array de tasks con modelo, prioridad, depends. El usuario puede:
- Aprobar → Crea work item con todo
- Editar tasks individuales
- Regenerar

**Alternativa manual**: En cualquier step, botón "Skip" para crear manualmente. El work item se crea con plan vacío y 0 tasks, el usuario agrega después.

---

## Ralph & Teams

### Ralph (modo individual)

1. Usuario selecciona UN work item desde la UI
2. Ralph toma todas las tareas en `todo` del work item
3. Dependency resolver calcula grupos de ejecución
4. Ejecuta secuencialmente (grupo a grupo), paralelo dentro de cada grupo
5. Cada tarea completada → mueve a `review`
6. Al terminar todas → work item status puede pasar a `review`

### Teams (modo equipo)

1. Usuario selecciona N work items
2. Coordinator asigna work items a workers
3. Cada worker ejecuta su work item como Ralph individual
4. Workers pueden correr en paralelo
5. Dashboard muestra progreso de cada worker en tiempo real

### Cambios vs agency-kanban

- `ralphLoop.ts`: recibe `workItemId` en vez de `projectSlug` + task list
- `coordinator.ts`: recibe `workItemIds[]` en vez de task list
- `dependencyResolver.ts`: opera sobre tasks de un work item (sin cambios internos)
- Socket events: agregan `workItemId` al payload

---

## Fases de Implementación

### Fase 0: Scaffold (sesión actual)
- [x] Crear directorio KANBAII
- [ ] package.json, tsconfigs, .gitignore
- [ ] CLAUDE.md fundacional
- [ ] Git init + commit inicial
- [ ] Estructura de carpetas vacía

### Fase 1: Data Layer
- [x] Type definitions (Project, WorkItem, Task, Column)
- [x] Zod schemas para validación
- [x] ProjectStore: CRUD proyectos (JSON read/write)
- [x] WorkItemStore: CRUD work items (JSON read/write)
- [x] ID generation (portable de generateStableId)
- [x] File watcher (Chokidar sobre JSONs)
- [x] Unit tests para stores

### Fase 2: API & Server
- [x] Express server + Socket.IO setup
- [x] Routes: /api/projects (CRUD)
- [x] Routes: /api/projects/:slug/work-items (CRUD)
- [x] Routes: /api/projects/:slug/work-items/:id/tasks (CRUD)
- [x] Routes: /api/health
- [x] Socket events: project:updated, workItem:updated, task:moved
- [x] typedEmit (portado)
- [x] Integration tests

### Fase 3: Frontend — Design System & Shell
- [x] Next.js scaffold (static export mode)
- [x] Design system: globals.css, theme.ts, CSS variables
- [x] Layout: sidebar + main content area
- [x] Sidebar: project list con colores, status, activity indicator
- [x] Routing: /project/:slug → WorkItemsBoard
- [x] Routing: /project/:slug/:workItemId → TaskBoard
- [x] Socket.IO client + Zustand stores base
- [x] Responsive (desktop-first, min 1280px)

### Fase 3.5: Portar assets visuales de agency-kanban
- [x] Favicon SVG (kanban columns en indigo) → `frontend/public/favicon.svg`
- [x] Favicon 16x16 → `frontend/public/favicon-16x16.svg`
- [x] manifest.json (PWA: nombre, theme_color, background_color)
- [x] theme.ts (theme utilities: constantes de colores, radius, spacing, transitions en TS)
- [x] ThemeContext.tsx (dark/light toggle + localStorage persistence)
- [x] ThemeToggle.tsx (animated toggle button con moon/sun icons)
- [x] LoadingSpinner.tsx (orbital spinner, 3 variantes: spinner/bar/dots)
- [x] Skeleton components (SkeletonCard, SkeletonColumn, SkeletonSidebar)
- [x] Animaciones faltantes en globals.css (sidebar-dot-pulse, schedule-pulse, agentCardEnter, etc.)

### Fase 4: Frontend — Work Items Board
- [x] WorkItemsBoard: kanban 4 columnas (Planning, Active, Review, Done)
- [x] WorkItemCard: categoría, progreso, vinculación, modelo, age
- [x] Drag & drop work items entre columnas (@atlaskit/pragmatic-drag-and-drop)
- [x] Drop zone highlighting (accent-muted + dashed border)
- [x] Post-move flash animation
- [x] Crear work item manual (sin wizard) — CreateWorkItemModal con category selector
- [x] Editar work item modal (título, categoría, link, status) — EditWorkItemModal
- [x] Eliminar work item (con confirmación)
- [x] Breadcrumb navigation (click card → task board, back button)
- [x] Animaciones y transiciones (cardSlideIn, postMoveFlash, drag states)
- [x] Empty state por columna y global ("No items")

### Fase 5: Frontend — Task Board + Interactions
- [x] TaskBoard: 5 columnas per work item (Backlog, Todo, In Progress, Review, Done)
- [x] Column component con header (nombre, count badge, + button)
- [x] TaskCard: checkbox, título, descripción, priority dot, model badge, tags, agent pill
- [x] TaskCard states: default, hover, completed (line-through + opacity), dragging (opacity + scale)
- [x] Drag & drop tasks entre columnas (@atlaskit/pragmatic-drag-and-drop)
- [x] TaskModal: crear/editar tarea (title, description, tags, priority, model, column, delete)
- [x] Plan viewer (panel colapsable en header con toggle button)
- [x] Back navigation a Work Items Board
- [x] Real-time updates via Socket.IO (workItem:updated)
- [x] Toast notifications (feedback de acciones: created, moved, deleted, errors)
- [x] Task completion flow: checkbox → toggle completed
- ~~FilterBar~~ → movido a **Fase 7** (ViewSwitcher & Navigation)
- ~~Done drawer con sort~~ → movido a **Fase 7**
- ~~Undo/redo~~ → movido a **Fase 7**
- ~~Task output panel~~ → movido a **Fase 8** (Ralph)
- ~~TaskCard running/failed states~~ → movido a **Fase 8** (Ralph)
- ~~Force reset/Retry/Stop~~ → movido a **Fase 8** (Ralph)

### Fase 6: Wizard
- [x] WizardModal: multi-step flow (max-width 640px, min-height 480px)
- [x] Step indicator (dots: filled/outlined/dimmed, adapts for features — skips Context step)
- [x] Step 1: Category selector (3 large cards: Feature/Bug/Refactor)
- [x] Step 2: Context/Link selector (solo bug/refactor, feature list, auto-skip for features)
- [x] Step 3: Prompt input (textarea con placeholder por categoría + hint)
- [x] Step 4: Plan generation + approval/edit toggle/preview
- [x] Step 5: Task list preview con edit inline/delete/add manual
- [x] Mock generation API (POST /api/generate/plan + /api/generate/tasks) — TODO: Claude CLI spawn in Fase 8
- [x] Manual skip en steps 3-4
- [x] Loading state: skeleton shimmer durante generación
- [x] Back/Next/Skip navigation, Create Work Item final button
- [x] Wizard button ("Wizard") + Quick button en WorkItemsBoard header

### Fase 7: ViewSwitcher, Navigation & Board Polish
- [x] ViewSwitcher component: Board / Terminal / Agents / Soul / Costs tabs
- [x] View icons (LayoutGrid, Terminal, Bot, Eye, BarChart3)
- [x] Placeholder views for Terminal/Agents/Soul/Costs (shows fase badge)
- [x] View routing via routerStore (view state + setView)
- [x] Keyboard shortcuts sistema completo:
  - [x] ↑/↓: previous/next project
  - [x] B: Board view, C: Console, R: Ralph, S: Soul
  - [x] N: New task
  - [x] Ctrl+F: FilterBar toggle
  - [x] H: Help modal, Esc: close modals
- [x] KeyboardShortcutsHelp modal (categorized, kbd styled keys)
- [x] FilterBar: search por título+descripción, filtrar por tags/priority/model *(desde Fase 5)*
- [x] Filter count display (filtered/total) + clear button
- [ ] Done drawer/section colapsable con sort (asc/desc by completedAt) *(desde Fase 5)*
- [ ] Undo/redo para movimientos de tasks (Ctrl+Z / Ctrl+Y, hasta 30 moves) *(desde Fase 5)*

### Fase 8: Engines — Ralph (Single Work Item Executor)
- [x] RunStore: state machine (idle/running/paused/stopping) + mutex + JSON persistence
- [x] Ralph loop: execute tasks from Todo column sequentially, move to Review on success
- [x] Claude runner: spawn CLI con `--permission-mode auto` via stdin, stream stdout
- [x] Socket events: ralph:started, ralph:progress, ralph:output, ralph:error, ralph:completed
- [x] Circuit breaker: max 3 errores consecutivos → stop
- [x] Ralph state persistence: recover from restart (reset stuck runs)
- [x] API routes: POST start/stop/pause/resume, GET state
- [x] AgentsView UI: work item selector, Run/Pause/Resume/Stop buttons, progress bar, stats
- [x] Live output streaming: monospace output panel con auto-scroll
- [x] Pause/Resume/Stop controls
- [x] Flaky test fix: same-millisecond assertions now stable
- [x] Test isolation: tests use temp dir (KANBAII_DATA_DIR), no longer destroy user data
- [ ] Dependency resolver: grupos de ejecución paralelos (portado)
- [ ] Rate limit management: normal/conservative/degraded/paused strategies
- [ ] Rate limit UI: gauge visualization con colores
- [ ] Ralph input handling: RalphInputModal cuando task necesita input manual
- [ ] Input timeout: countdown timer, extend option, auto-resolve
- [ ] Run confirmation modal (antes de empezar)
- [ ] Task output panel: streaming output en TaskCard/modal *(desde Fase 5)*
- [ ] TaskCard states: running (glow animation), failed (red left border) *(desde Fase 5)*
- [ ] Force reset / Retry / Stop buttons en tasks ejecutándose *(desde Fase 5)*
- [ ] **Review with Claude** (portado de agency-kanban):
  - [ ] Task completa (exit 0) → auto-move a Review, guardar `previousColumn` en task meta
  - [ ] Botón "Review with Claude" en task card/modal cuando está en Review
  - [ ] Panel de conversación multi-turn con contexto (output, description, errors)
  - [ ] API: `GET /api/projects/:slug/work-items/:wi/tasks/:id/review-context`
  - [ ] SSE streaming para mensajes de Claude en review
  - [ ] Uncheck checkbox en Review → mueve task de vuelta a `previousColumn`
  - [ ] Check checkbox en Review → mueve a Done
  - [ ] Hasta 20 turns de conversación con `--resume` para mantener contexto
- [ ] **ClaudeUsageWidget en sidebar** (portado de agency-kanban):
  - [ ] `GET /api/claude-usage` — fetch rate limits desde Claude API (OAuth token)
  - [ ] Widget en sidebar (sección "Monitor" colapsable):
    - Barras de progreso por rate limit entry (session, weekly, etc.)
    - Color: indigo <60%, amber 60-79%, red ≥80%
    - Reset time por entry
    - Modo collapsed: mini barra vertical con % máximo
    - Modo critical-only: solo muestra entries ≥80% con pulso rojo
  - [ ] Socket event `claude-usage` para updates real-time
  - [ ] Hydrate desde sessionStorage para evitar flash
  - [ ] Retry cada 5s hasta que cargue, timeout a 30s

### Fase 8.5: Corrección Arquitectónica (BLOCKER — antes de seguir)

**Problemas detectados por el usuario que deben resolverse:**

#### 8.5.1 — Estado centralizado (Single Source of Truth)
- [x] `useAppStore.ts` (Zustand) como SSOT de ejecución
  - Ralph state (status, currentTask, output, stats) persiste al cambiar de vista
  - Socket events wired en `useSocket` → appStore
  - `rehydrate()` en connect/reconnect via `GET /api/ralph/state`
- [x] AgentsView lee de `useAppStore`, no de useState local
- [x] TaskBoard lee de `useAppStore` para Ralph panel

#### 8.5.2 — Soul y Costs en sidebar (no como tabs)
- [x] ViewSwitcher reducido a 3 tabs: Board / Terminal / Agents
- [x] Soul widget en sidebar: Eye icon + heartbeat badge
- [x] Costs widget en sidebar: BarChart3 icon + $0.00 display
- [x] Widgets solo visibles cuando hay proyecto seleccionado

#### 8.5.3 — workingDir visible y configurable
- [x] Input `workingDir` en CreateProjectModal
- [x] FolderOpen button en sidebar project actions (visible cuando workingDir seteado)
- [x] `POST /api/system/open-folder` — abre explorer.exe / open / xdg-open
- [x] `workingDir` en Project type, schema, DTO (backend)

#### 8.5.4 — Ralph vive en el contexto de Work Item, no en Board
- [x] Run/Stop buttons en TaskBoard header (per work item)
- [x] Collapsible Ralph output panel en TaskBoard footer
- [x] AgentsView cambiado a dashboard: muestra run activo + output, no permite iniciar runs
- [x] "View Work Item →" link en AgentsView para navegar al WI en ejecución

#### 8.5.5 — Fix Claude permissions
- [x] Cambiar `--enable-auto-mode` → `--permission-mode auto` (flag real de Claude CLI)

#### 8.5.6 — Fix "To Do"
- [x] "Todo" → "To Do" en TaskBoard, TaskModal, AgentsView, shared/types

### Fase 9: Engines — Teams & Agent System
- [x] Agent registry: load agents from JSON, 5 built-in agents (Coder, Tester, Reviewer, Doc, Security)
- [x] Agent profiles: name, description, model, skills, tools, instructions, builtIn flag
- [x] Agent builder UI: create modal with all fields + delete custom agents
- [x] Agent forge: generate agent from natural language via Claude
- [x] Agent suggestion: auto-select agent based on task tags (GET /api/agents/suggest)
- [x] Task router: skill-based matching, precision-based tie-breaking, structural tags ignored
- [x] AgentsView UI: agent list + detail panel + Ralph status + output
- [x] Teams/Coordinator: execute N work items in parallel with worker pool
- [x] Teams API: POST start/stop, GET state
- [x] Agent-aware prompts: agent instructions injected into task prompts
- [ ] Agent assignment UI: badge sólido (explícito) vs borde discontinuo (auto) en task cards
- [ ] Agent budget tracker: per-agent daily/monthly spend + limits
- [ ] Worker pool visual: slots con status por worker en UI
- [ ] Escalation system: coordinator pregunta al usuario, timeout + auto-resolve

### Fase 10: Living Room (Multi-Agent Live Coordination)
- [x] Socket events: live:started, live:worker-assigned, live:worker-completed, live:metrics, live:stopped
- [x] Teams engine emits live events during parallel execution
- [x] LivingRoom UI: 3-panel layout (config / worker pool / logs)
- [x] Config panel: work item multi-select checkboxes, worker count slider (1-10)
- [x] WorkerPoolView: grid slots con glow animation cuando executing, idle state
- [x] Start/Stop controls en header con live indicator dot
- [x] Metrics panel: active workers, completed, failed, total + progress bar
- [x] Completed workers list con status icons (✓/✗)
- [x] Execution logs panel con auto-scroll
- [x] ViewSwitcher: Teams tab con Users icon, shortcut T
- [ ] CoordinatorBrain: thinking state + reasoning display
- [ ] AgentChatLog: historial de chat entre agentes
- [ ] ToolCallsPanel: tool invocations recientes
- [ ] LiveConfigPanel tabs: MCPs, Skills, Runtime, History
- [ ] Demo mode: mock agent states cuando idle

### Fase 10.5: Visual Redesign ✅ (done 2026-03-26)
- [x] globals.css v3: "Obsidian Operations Center" — blue-black depths, indigo-tinted borders, grain texture, glass shelf effects, JetBrains Mono, gradient buttons, recessed inputs
- [x] All 9 CSS modules rewritten: WorkItemsBoard, TaskBoard, AgentsView, LivingRoom, FilterBar, ViewSwitcher, WizardModal, TaskModal, CreateProjectModal, KeyboardHelp, CreateWorkItemModal
- [x] Cards: ::before glass shelf + ::after hover glow + translateY(-2px) + shadow bloom
- [x] Modals: blur(16px) saturate(180%) overlay + radial indigo glow + scale(0.95) entry
- [x] Buttons: gradient fills + glow hover + inner highlight ::before
- [x] Inputs: inset shadows + focus glow ring
- [x] Typography: JetBrains Mono on labels/counts/stats, -0.02em title tracking, Inter stylistic sets
- [x] Column headers: terminal aesthetic (10px mono uppercase 0.08em)
- [x] Worker pool: glass slots with glow animation + breathe effects
- [x] Design System V2 doc: docs/DESIGN-SYSTEM-V2.md

### Fase 11: MCPs, Skills & Plugins
**Portado de agency-kanban + nuevo sistema de plugins**

#### MCPs (Model Context Protocol servers)
- [x] MCP config storage: `data/.mcp-config.json` (per-project overridable)
- [x] Backend service: `mcpConfig.ts` — list, add, update, delete, toggle, test, presets
- [x] API: GET/POST/DELETE `/api/mcp/servers`, PATCH toggle, POST test, GET presets
- [x] `--mcp-config` flag passed to Claude CLI when executing tasks
- [x] LiveMcpTab UI: list MCP servers, add/remove/edit modals, test connection, presets modal
- [ ] Per-agent MCP tool filters (agent can only use specific MCP tools)
- [x] Built-in MCP support: context7, brave-search, GitHub, filesystem (presets endpoint)

#### Skills
- [x] Skills registry: `data/.skills.json` (JSON definitions)
- [x] Claude skills manager: convert skills to markdown for `--append-system-prompt`
- [x] API: GET/POST/DELETE `/api/skills`, PATCH toggle
- [x] LiveSkillsTab UI: list skills, create/edit modal, toggle, prompt template editor
- [x] Skill format: name, description, prompt template, tools required

#### Plugins (nuevo — no existía en agency-kanban)
- [x] Plugin system: loadable JS/TS modules from `data/.plugins/`
- [x] Plugin interface: `{ name, version, hooks: { preTask?, postTask?, preRun?, postRun? } }`
- [x] Plugin hooks execute before/after task/run execution (wired in Ralph)
- [x] API: GET `/api/plugins` (list), POST `/api/plugins/toggle`, POST `/api/plugins/rescan`
- [x] Plugin dir scanning + hot-reload on file change
- [x] LivePluginsTab UI: list plugins, enable/disable, view hooks with tags
- [x] Example plugins: git-auto-commit, cost-logger

### Fase 12: Terminal
- [x] ClaudeTerminal: main terminal component con xterm.js + Socket.IO streaming
- [x] PtyTerminal: pseudo-terminal con xterm.js + node-pty backend
- [x] Claude CLI spawn con `--dangerously-skip-permissions` en el workingDir del proyecto
- [x] Per-project terminal sessions (state in Zustand appStore)
- [x] Command palette: /help, /status, /clear, /reset, /model, /tasks (Ctrl+K toggle)
- [x] Stop button, Reset button
- [x] Running state: elapsed time counter, model selector dropdown
- [ ] Context window indicator: token usage + cache stats
- [ ] Session totals: cumulative input/output tokens
- [ ] "Review with Claude" integration (preload prompt from task)
- [x] Status states: idle / running / error (dot indicator + class styles)

### Fase 13: Soul System
- [x] Soul documents per project: SOUL.md, ME.md, HEALTH.md (auto-created in soul dir)
- [x] SoulView UI: tabs para Documents, Memory, Daily Logs, Health
- [x] MemoryTab: memory CRUD + add/delete entries + source badges
- [x] DailyLogsList + DailyLogEntry: listado de logs diarios con timestamps
- [x] ResetMemoryDialog: confirm reset con glassmorphism modal
- [x] API: GET/PUT /api/soul/documents, GET/POST/PATCH/DELETE /api/soul/memory, POST /api/soul/memory/reset
- [x] Memory logger: daily logs (projects/{slug}/soul/logs/{YYYY-MM-DD}.md)
- [x] HEALTH.md auto-generation: execution rate, success rate, stuck tasks, score ring UI
- [x] Soul config: heartbeat (enabled, interval, model) — config API + toggle in UI
- [x] Health metrics: score (0-100), execution rate, success rate, stuck tasks, last run
- [x] ViewSwitcher: Soul tab con Eye icon, shortcut S
- [ ] ME updater: AI-powered learning from execution patterns
- [ ] Heartbeat system: periodic health check (auto-run via interval)
- [ ] Heartbeat widget en sidebar: mini health badge

### Fase 14: Scheduler & Recurring Execution
- [x] Scheduler core: scheduling (once, daily, weekly, biweekly, monthly) with next-run computation
- [x] Schedule API: CRUD /api/scheduler/schedules, GET task schedule, POST run/cancel, scheduler start/stop
- [x] ScheduleConfigForm: frequency picker, time picker, day-of-week selector (in TaskModal)
- [x] Schedule section en TaskModal: view/create/edit/delete schedule per task
- [x] Run now button: execute inmediatamente via POST /schedules/:id/run
- [x] Cancel button + enable/disable toggle
- [x] Stale task watchdog: detectar tasks stuck > 30 minutos, auto-reset
- [x] Scheduled runs persistence: JSON file, restore on backend restart
- [x] Scheduler status API: running, active, runningNow, nextDue
- [ ] SchedulePanel UI: standalone panel con active/running/failed overview
- [ ] Manual input gate: flag para tasks que requieren input humano
- [ ] Runner status indicator: alive/dead health check widget

### Fase 15: Costs, Analytics & Settings
- [x] Cost tracking backend: inputTokens, outputTokens, cacheTokens, costUsd per execution (costTracker.ts)
- [x] Usage persistence: data/.usage.json (global, filterable by project)
- [x] CostsPanel UI: summary cards (today/monthly cost, tokens, executions) + model breakdown bars + execution table
- [x] Time range filters: 7d / 30d / all
- [x] Scope toggles: project-specific OR global
- [x] Today/Monthly summary cards: cost, tokens, executions
- [x] Detailed execution table: task, model, duration, cost, status
- [x] Model pricing: opus/sonnet/haiku with input/output/cache rates
- [x] Cost recording wired into Ralph (auto-records after each task)
- [ ] Claude usage widget en sidebar: real-time API usage + rate limits
- [ ] Project budget tracking: daily/monthly limits, warn at %, auto-pause
- [x] SettingsModal UI:
  - [x] Default model (opus/sonnet/haiku)
  - [x] Timezone
  - [x] Scheduler settings (enabled, maxConcurrent, timeout, staleThreshold)
  - [x] Terminal settings (inactivity warn/kill, max timeout)
  - [x] Ralph config (maxIterations, circuitBreaker, taskFilter)
  - [x] Auth config (enabled, secret, tokenExpiry)
  - [x] Integrations (Telegram, Voice)
- [x] API: GET/PUT /api/settings, GET/PATCH /api/settings/:section
- [x] API: GET /api/costs/summary, GET /api/costs/executions, POST /api/costs/record, DELETE /api/costs/clear

### Fase 16: Auth, Voice & Integrations
- [x] Auth system: HMAC JWT + PBKDF2 (no bcrypt dep), optional — enable via settings
- [x] Login page: LoginPage component with register/login toggle
- [x] Auth middleware: protect /api/* routes (skips /api/auth/ and /api/health)
- [x] Auth status API: GET /api/auth/status, POST register/login, GET verify
- [x] Voice input: VoiceInput component with Web Speech API (browser-native)
- [x] VoiceInput: recording, live transcript, editable result, confirm/re-record
- [x] Telegram integration: sendMessage, notifyRalphStarted/Completed, notifyError
- [x] Telegram config in SettingsModal (botToken, chatId, enabled)
- [x] Telegram wired into Ralph (start/complete notifications)
- [ ] Session management: httpOnly cookies (currently uses Bearer tokens)
- [ ] Voice transcription: OpenAI Whisper fallback
- [ ] Telegram bot: inline keyboards para input requests

### Fase 17: NPM Package & CLI — Experience Design

**Filosofía**: La CLI es la primera impresión. Debe sentirse premium, rápida, y memorable. Inspiración: Vercel CLI, Stripe CLI, Railway CLI.

#### 16.1 Branding & Visual Identity en Terminal
- [ ] ASCII art logo KANBAII (minimalista, indigo-themed con chalk)
- [ ] Tagline: "AI-native kanban for builders"
- [ ] Color palette para terminal: indigo (primary), green (success), amber (warning), red (error), gray (muted)
- [ ] Consistent prefix: `⬡ kanbaii` en todos los outputs
- [ ] Versión + link al dashboard en cada comando

#### 16.2 First Run Experience (`npx kanbaii`)
- [ ] Detectar si es primera vez (no existe data dir)
- [ ] Welcome screen animado:
  ```
  ⬡ K A N B A I I

  AI-native kanban for builders
  v0.1.0

  Welcome! Let's set up your workspace.
  ```
- [ ] Interactive setup wizard (inquirer/prompts):
  - [ ] Step 1: "Where to store projects?" → default `./data` o custom path
  - [ ] Step 2: "Create your first project?" → title + color picker (terminal palette)
  - [ ] Step 3: "Enable auth?" → yes/no (default: no para local dev)
  - [ ] Step 4: "Port?" → default 5555
- [ ] Animated progress durante setup (ora spinners):
  ```
  ◐ Creating project directory...
  ◑ Initializing data store...
  ◒ Building dashboard...
  ✓ Ready!
  ```
- [ ] Final screen con next steps:
  ```
  ✓ KANBAII is ready!

  → Dashboard: http://localhost:5555
  → Data dir:  ./data/projects

  Quick commands:
    kanbaii start     Start the server
    kanbaii stop      Stop the server
    kanbaii status    Check health
    kanbaii --help    All commands
  ```
- [ ] Auto-open browser al terminar setup

#### 16.3 Commands

##### `kanbaii start`
- [ ] Pre-flight checks con spinners:
  ```
  ⬡ kanbaii start

  ◐ Checking data directory...     ✓
  ◑ Starting server on :5555...    ✓
  ◒ Loading 3 projects...          ✓

  ⬡ KANBAII running on http://localhost:5555

  Press Ctrl+C to stop
  ```
- [ ] Si puerto ocupado: sugerir alternativo con prompt
- [ ] Si ya corriendo: mostrar PID + uptime + link
- [ ] Flag `--port` para override
- [ ] Flag `--no-open` para no abrir browser
- [ ] Flag `--daemon` / `-d` para correr en background

##### `kanbaii stop`
- [ ] Graceful shutdown con feedback:
  ```
  ⬡ kanbaii stop

  ◐ Stopping server (PID 12345)...
  ✓ Server stopped gracefully
  ```
- [ ] Si no está corriendo: mensaje claro
- [ ] Si daemon: encontrar PID y matar

##### `kanbaii status`
- [ ] Dashboard en terminal (box-drawing characters):
  ```
  ⬡ kanbaii status

  ┌─────────────────────────────────────┐
  │  Server    ● Running  :5555        │
  │  Uptime    2h 34m                   │
  │  Projects  3 active                 │
  │  Memory    48 MB                    │
  ├─────────────────────────────────────┤
  │  Work Items                         │
  │  Planning: 2  Active: 5            │
  │  Review: 1    Done: 12             │
  ├─────────────────────────────────────┤
  │  Ralph     ○ Idle                   │
  │  Teams     ○ Idle                   │
  │  Last run  feat-auth  2h ago  ✓    │
  └─────────────────────────────────────┘
  ```
- [ ] Flag `--json` para output parseable
- [ ] Exit code 0 si healthy, 1 si down

##### `kanbaii init`
- [ ] Re-run del setup wizard en directorio existente
- [ ] Si ya inicializado: preguntar si reiniciar config
- [ ] Flag `--force` para overwrite

##### `kanbaii projects`
- [ ] Listar proyectos en tabla:
  ```
  ⬡ kanbaii projects

  NAME              STATUS   WORK ITEMS   PROGRESS
  My App            active   5            ████░░ 62%
  Landing Page      active   2            ██████ 100%
  API Refactor      active   3            █░░░░░ 15%
  ```

##### `kanbaii run <work-item>`
- [ ] Ejecutar Ralph desde CLI en un work item específico
- [ ] Live output streaming en terminal (coloreado)
- [ ] Progress bar para tasks:
  ```
  ⬡ kanbaii run feat-auth-system

  Running 5 tasks with Ralph...

  [1/5] ✓ Setup bcrypt hashing        12s  sonnet
  [2/5] ◐ Implement JWT generation...
  ```
- [ ] Ctrl+C para detener limpiamente

##### `kanbaii logs [--follow]`
- [ ] Mostrar últimos logs del server
- [ ] `--follow` / `-f` para tail en vivo
- [ ] `--lines` / `-n` para cantidad

##### `kanbaii --help`
- [ ] Help formateado con colores y categorías:
  ```
  ⬡ K A N B A I I  v0.1.0

  USAGE
    kanbaii <command> [options]

  COMMANDS
    start           Start the KANBAII server
    stop            Stop the server
    status          Show server and project status
    init            Initialize workspace
    projects        List all projects
    run <item>      Execute a work item with Ralph
    logs            Show server logs

  OPTIONS
    --port, -p      Server port (default: 5555)
    --daemon, -d    Run in background
    --no-open       Don't open browser
    --json          JSON output (for scripting)
    --version, -v   Show version
    --help, -h      Show help

  DOCS  https://github.com/martinmsaavedra/kanbaii
  ```

#### 16.4 Technical Implementation
- [ ] CLI framework: Commander.js
- [ ] Terminal styling: chalk (colores), ora (spinners), boxen (boxes)
- [ ] Interactive prompts: @inquirer/prompts
- [ ] Tables: cli-table3
- [ ] Progress bars: cli-progress
- [ ] PID management: escribir PID a `data/.kanbaii.pid` en start, leer en stop/status
- [ ] Signal handling: SIGINT, SIGTERM → graceful shutdown con feedback
- [ ] Static frontend build: `frontend/out/` → `dashboard/` (incluido en npm package)
- [ ] Runtime config injection: `window.__KANBAII_CONFIG__` script tag en index.html
- [ ] Package `files`: `dist/` (server+CLI) + `dashboard/` (frontend build)
- [ ] `bin.kanbaii` → `dist/cli/index.js`
- [ ] Postinstall: no heavy setup (lazy init on first `kanbaii start`)

#### 16.5 Error Handling & Edge Cases
- [ ] Puerto ocupado: detectar y sugerir alternativo
- [ ] Permisos: error claro si no puede escribir data dir
- [ ] Node version: check >= 18 con mensaje claro
- [ ] No internet: funciona 100% offline (excepto Claude API calls)
- [ ] Ctrl+C durante setup: cleanup parcial, mensaje de re-run
- [ ] Crash recovery: `kanbaii start` detecta PID stale y limpia

---

## Feature Parity Matrix: agency-kanban → KANBAII

| Feature | agency-kanban | KANBAII Fase | Adaptación |
|---------|--------------|-------------|------------|
| Kanban board | Flat (Project → Tasks) | **4-5** | Two-level (Work Items → Tasks) |
| Drag & drop | pragmatic-drag-and-drop | **4-5** | Same lib, two boards |
| Task CRUD + modal | ✓ | **5** | Scoped to work item |
| FilterBar | ✓ | **5** | Per work item |
| Done drawer | ✓ | **5** | Per work item |
| Undo/redo | ✓ | **5** | Same |
| Toast notifications | ✓ | **5** | Same |
| Task output panel | ✓ | **5** | Same |
| Wizard (new) | ✗ | **6** | New feature |
| ViewSwitcher | ✓ | **7** | Adapted for new views |
| Keyboard shortcuts | ✓ | **7** | Same system |
| Ralph (single executor) | ✓ | **8** | Scoped to work item |
| Rate limit management | ✓ | **8** | Same |
| Ralph input handling | ✓ | **8** | Same |
| Agent system | ✓ | **9** | Same core + new assignment rules |
| Agent builder | ✓ | **9** | Same |
| Agent budgets | ✓ | **9** | Same |
| Teams/Coordinator | ✓ | **9** | Multi work item |
| Living Room | ✓ | **10** | Adapted for work items |
| Worker pool | ✓ | **10** | Same |
| Escalation system | ✓ | **10** | Same |
| Terminal (PTY + CLI) | ✓ | **11** | Same, scoped to project |
| Command palette | ✓ | **11** | Same |
| Soul system | ✓ | **12** | Per project (sin cambios) |
| Memory/daily logs | ✓ | **12** | Same |
| Heartbeat | ✓ | **12** | Same |
| ME updater | ✓ | **12** | Same |
| Scheduler UI | ✓ | **13** | Adapted for work item tasks |
| Recurring execution | ✓ | **13** | Same core |
| Costs/Analytics | ✓ | **14** | Per work item + global |
| Settings modal | ✓ | **14** | Expanded |
| Project budgets | ✓ | **14** | Same |
| Auth (JWT) | ✓ | **15** | Same, optional |
| Voice input | ✓ | **15** | Same |
| Telegram | ✓ | **15** | Same |
| NPM package + CLI | ✓ | **16** | Same |
| Masks (custom views) | ✓ | **Future** | Deprioritized — evaluate post-MVP |
| External sync (TASKS.md) | ✓ | **Eliminado** | Replaced by JSON persistence |
| Docker support | ✓ | **Eliminado** | NPM only |
| Markdown parser | ✓ | **Eliminado** | JSON native |

## Stack Técnico

| Componente | Tecnología |
|-----------|-----------|
| Backend | Express 4 + Socket.IO 4 |
| Frontend | Next.js 14 (static export) |
| State (FE) | Zustand |
| Drag & Drop | @atlaskit/pragmatic-drag-and-drop |
| Animations | framer-motion |
| Validation | Zod |
| File watching | Chokidar |
| CLI | Commander.js |
| Testing | Vitest |
| AI | Claude CLI (spawn) |
| Terminal | xterm.js |
| Charts | Recharts |
| Styling | CSS Modules + CSS Variables |
| Font | Inter |
| Icons | Lucide React |

## Puertos

| Servicio | Puerto |
|----------|--------|
| Express API + Socket.IO + Static Frontend | 5555 (default, configurable) |

Un solo puerto. Express sirve la API en `/api/*`, Socket.IO en `/`, y el frontend estático en `/*`.

---

## Criterios de MVP (Fases 0-6)

El MVP está listo cuando:
- [ ] Se puede crear un proyecto
- [ ] Se puede crear un work item (manual + wizard) con categoría
- [ ] Se puede ver el kanban de work items (4 columnas)
- [ ] Se puede entrar a un work item y ver su task board (5 columnas)
- [ ] Se pueden crear/mover/editar/completar tareas
- [ ] Drag & drop funciona en ambos niveles
- [ ] FilterBar funciona (search + tags + priority + model)
- [ ] Datos persisten en JSON (sobrevive restart)
- [ ] Real-time updates via Socket.IO
- [ ] UI es limpia, fluida, y profesional
- [ ] `npm start` levanta todo sin Docker

## Criterios de Feature Parity (Fases 7-15)

Feature parity con agency-kanban alcanzada cuando:
- [ ] Todas las vistas funcionan: Board, Terminal, Agents, Soul, Costs
- [ ] Ralph ejecuta tareas de un work item autónomamente
- [ ] Teams coordina ejecución de múltiples work items
- [ ] Living Room muestra agentes en vivo
- [ ] Terminal con PTY y command palette
- [ ] Soul con memory, logs, heartbeat, health
- [ ] Scheduler con recurring execution
- [ ] Costs con charts y budget tracking
- [ ] Settings configurables
- [ ] Auth opcional, Voice opcional, Telegram opcional
