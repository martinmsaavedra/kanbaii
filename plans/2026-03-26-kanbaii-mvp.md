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
- [ ] Type definitions (Project, WorkItem, Task, Column)
- [ ] Zod schemas para validación
- [ ] ProjectStore: CRUD proyectos (JSON read/write)
- [ ] WorkItemStore: CRUD work items (JSON read/write)
- [ ] ID generation (portable de generateStableId)
- [ ] File watcher (Chokidar sobre JSONs)
- [ ] Unit tests para stores

### Fase 2: API & Server
- [ ] Express server + Socket.IO setup
- [ ] Routes: /api/projects (CRUD)
- [ ] Routes: /api/projects/:slug/work-items (CRUD)
- [ ] Routes: /api/projects/:slug/work-items/:id/tasks (CRUD)
- [ ] Routes: /api/health
- [ ] Socket events: project:updated, workItem:updated, task:moved
- [ ] typedEmit (portado)
- [ ] Integration tests

### Fase 3: Frontend — Design System & Shell
- [ ] Next.js scaffold (static export mode)
- [ ] Design system: globals.css, theme.ts, CSS variables
- [ ] Layout: sidebar + main content area
- [ ] Sidebar: project list con colores, status, activity indicator
- [ ] Routing: /project/:slug → WorkItemsBoard
- [ ] Routing: /project/:slug/:workItemId → TaskBoard
- [ ] Socket.IO client + Zustand stores base
- [ ] Responsive (desktop-first, min 1280px)

### Fase 4: Frontend — Work Items Board
- [ ] WorkItemsBoard: kanban 4 columnas (Planning, Active, Review, Done)
- [ ] WorkItemCard: categoría, progreso, vinculación, modelo
- [ ] Drag & drop work items entre columnas
- [ ] Crear work item manual (sin wizard)
- [ ] Editar work item (título, categoría, link)
- [ ] Breadcrumb navigation
- [ ] Animaciones y transiciones (framer-motion)

### Fase 5: Frontend — Task Board
- [ ] TaskBoard: 5 columnas per work item
- [ ] Column + TaskCard (portados y adaptados)
- [ ] Drag & drop tasks entre columnas
- [ ] TaskModal: crear/editar tarea
- [ ] Plan viewer (panel colapsable en header)
- [ ] Back navigation a Work Items Board
- [ ] Real-time updates via Socket.IO

### Fase 6: Wizard
- [ ] WizardModal: multi-step flow
- [ ] Step 1: Category selector
- [ ] Step 2: Link selector (bug/refactor)
- [ ] Step 3: Prompt input
- [ ] Step 4: Plan generation (Claude) + approval
- [ ] Step 5: Task generation (Claude) + approval
- [ ] Claude runner integration (spawn CLI)
- [ ] Manual skip en cada step

### Fase 7: Engines
- [ ] RunStore (portado)
- [ ] Ralph: execute single work item
- [ ] Teams/Coordinator: execute multiple work items
- [ ] Dependency resolver (portado)
- [ ] Agent system: taskRouter, registry (portado)
- [ ] Socket events para progreso real-time
- [ ] AgentsView UI (adaptada para work items)

### Fase 8: Terminal & Soul
- [ ] Terminal system (PTY, portado)
- [ ] Soul system per project (portado)
- [ ] Scheduler (simplificado, sin Docker runner)
- [ ] Settings/preferences

### Fase 9: NPM Package
- [ ] CLI: `kanbaii init` → setup data dir
- [ ] CLI: `kanbaii start` → run server + open browser
- [ ] CLI: `kanbaii stop` → graceful shutdown
- [ ] CLI: `kanbaii status` → health check
- [ ] Static frontend build + Express serve
- [ ] Runtime config injection (window.__KANBAII_CONFIG__)
- [ ] Auth system (portado, optional)
- [ ] README + docs

---

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
| Styling | CSS Modules + CSS Variables |
| Font | Inter |
| Icons | Lucide React |

## Puertos

| Servicio | Puerto |
|----------|--------|
| Express API + Socket.IO + Static Frontend | 5555 (default, configurable) |

Un solo puerto. Express sirve la API en `/api/*`, Socket.IO en `/`, y el frontend estático en `/*`.

---

## Criterios de MVP

El MVP (Fases 0-5) está listo cuando:
- [ ] Se puede crear un proyecto
- [ ] Se puede crear un work item (manual) con categoría
- [ ] Se puede ver el kanban de work items
- [ ] Se puede entrar a un work item y ver su task board
- [ ] Se pueden crear/mover/editar/completar tareas
- [ ] Drag & drop funciona en ambos niveles
- [ ] Datos persisten en JSON (sobrevive restart)
- [ ] Real-time updates via Socket.IO
- [ ] UI es limpia, fluida, y profesional
- [ ] `npm start` levanta todo sin Docker
