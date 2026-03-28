# KANBAII — Project Instructions

## REGLA #0 — Tailwind CSS SIEMPRE (NUNCA inline styles)

**Todo estilo visual DEBE usar clases de Tailwind CSS. PROHIBIDO usar `style={{}}` inline en componentes.**

### Reglas absolutas:
1. **Todo estilo vía clases Tailwind** — layout, spacing, colors, fonts, borders, shadows
2. **CSS variables solo para valores dinámicos de theme** — `style={{ '--cat-color': color }}` y consumir con `bg-[var(--cat-color)]`
3. **NUNCA escribir layout, spacing, colors, fonts, borders, shadows en style={{}}**
4. **Clases complejas reutilizables** → `@layer components` en globals.css (`.btn-primary`, `.card`, `.modal-box`, etc.)
5. **Animaciones** → definidas en tailwind.config.ts (keyframes + animation), usadas como `animate-card-in`, `animate-spring-pop`, etc.
6. **Única excepción**: Framer Motion dynamic values (`animate={{ x: ... }}`) y CSS variable passthrough (`style={{ '--var': value }}`)
7. **NO crear archivos .module.css** — todo es Tailwind

### Anti-patrones PROHIBIDOS:
- `style={{ background: 'var(--surface)', padding: 12, borderRadius: 8 }}`
- `style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}`
- Crear archivos `.module.css` nuevos
- Definir estilos en funciones JS que podrían ser clases Tailwind

---

## REGLA #1 — Estado Centralizado (NUNCA VIOLAR)

**Todo estado de ejecución y proceso DEBE vivir en el store central (useAppStore) y NUNCA en estado local de componentes.**

### Reglas absolutas:
1. **PROHIBIDO useState para estado de procesos** — Ralph, Teams, Terminal, cualquier proceso que corre en background DEBE usar useAppStore
2. **Cambiar de vista NO puede perder estado** — Si Ralph corre, si Teams corre, si hay output, logs, workers, métricas: TODO persiste al navegar entre tabs/vistas
3. **Un solo escritor por campo** — Cada campo del appStore tiene un único responsable de escribirlo
4. **Rehidratación en reconexión** — Al hacer F5 o reconectar socket, el estado se recupera desde el backend via API
5. **Los componentes SOLO leen del store** — Nunca generan su propio estado de ejecución

### Cómo aplicar:
- Workers de Teams → `appStore.teams.workers[]`
- Logs de Teams → `appStore.teams.logs[]`
- Métricas de Teams → `appStore.teams.metrics`
- Output de Ralph → `appStore.ralph.output[]`
- Estado de Terminal → `appStore.terminal`
- **Cualquier feature futura sigue esta misma regla**

### Anti-patrones PROHIBIDOS:
- `useState` para logs, output, workers, métricas de procesos
- Estado que solo vive mientras el componente está montado
- Duplicar estado entre store y componente local
- Perder datos al cambiar de tab/vista

---

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

## REGLA #2 — Design Concept: "Obsidian Cockpit" (APLICAR SIEMPRE)

**Cada cambio de UI/UX DEBE seguir este concepto. No es opcional. Es la identidad de la app.**

KANBAII es un cockpit de operaciones en obsidiana digital. Superficies oscuras y profundas donde la información flota como luz. Todo es preciso, nada sobra. La interfaz no grita — susurra con autoridad.

### Los 7 Principios (aplicar en CADA componente)

**1. Luminiscencia sobre sombra** — Los bordes brillan, no dividen. Jerarquía con luz (glows, gradientes sutiles, top-edge highlights), no con sombras pesadas.

**2. Silencio visual** — Máximo 2 niveles de contraste simultáneo. Los botones son texto + ícono, no cajas ruidosas. Las acciones se descubren (hover, context menu, keyboard), no se imponen. Whitespace generoso.

**3. Movimiento orgánico** — Todo usa spring physics (cubic-bezier con overshoot), nunca ease linear. Stagger obligatorio en listas de cards (60ms delay). Los elementos idle respiran (breathe animation) — la UI nunca está completamente quieta.

**4. Materialidad digital** — Surfaces con textura grain (noise SVG sutil). Modales con glassmorphism real: blur(20px) + saturate(200%) + gradient top-edge. Cards con top-edge highlight de 1px (estante de cristal). Gradient accent bars en borde izquierdo.

**5. Color con propósito** — Un solo accent: indigo #6366f1 (la energía del sistema). Colores semánticos secundarios. En dark: luminosos sobre oscuro (neón apagado). En light: profundos sobre claro (tinta sobre papel premium).

**6. Tipografía como arquitectura** — Inter para UI, JetBrains Mono para datos. Jerarquía estricta: H1 20px/700, H2 15px/600, Body 13px/400, Label 9px/600/uppercase/mono, Data 10px/mono. Números siempre en monospace.

**7. Interacción sin fricción** — Cero botones innecesarios. Command Palette (Cmd+K) para todo. Inline editing (click para editar). Drag & drop con feedback premium. Hold-to-delete (sin diálogos feos).

### Materialización por modo

**Dark Mode — "Obsidian"**: Fondo #050509 (negro-azulado profundo). Borders rgba(148,163,242,0.06) (brillan, no dividen). Texto #e8e8f0 (blanco cálido, nunca #fff puro). Sensación: bridge de una nave.

**Light Mode — "Porcelain"**: Fondo #f8f8fb (off-white cálido). Borders rgba(0,0,30,0.06) (neutro cálido). Texto #0f0f18 (negro-azulado, nunca #000 puro). Accent #4f46e5 (más profundo para contraste). Sensación: papel de diseñador japonés.

### Estándar de calidad
- **El máximo nivel de diseño gráfico posible** — cada componente debe verse como si fuera de una app de primer nivel (Linear, Raycast, Vercel)
- Si un componente no se ve premium, no está terminado
- Cada interacción debe sentirse satisfactoria (como un teclado mecánico de gama alta)
- La UI debe dar ganas de trabajar

### Anti-patrones PROHIBIDOS:
- Botones grandes y ruidosos donde un ícono sutil basta
- Colores planos sin gradiente ni glow
- Transiciones con ease linear (usar spring siempre)
- Cards sin accent bar ni top-edge highlight
- Empty states de solo texto (deben tener animación + CTA)
- Modales sin glassmorphism
- Cualquier elemento que se sienta "amateur" o "genérico"

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

## Git Strategy — develop + master

```
develop ← daily work. All commits go here.
master  ← production. Auto-publishes to npm via GitHub Action.
```

### REGLA ABSOLUTA: NUNCA pushear directo a master

- **Todo el trabajo se hace en `develop`**
- Para publicar: merge develop → master (via PR o merge local)
- El GitHub Action en master auto-buildea y publica a npm
- NUNCA hacer `git push origin master` con cambios directos
- NUNCA hacer `npm publish` manual — el CI lo hace

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
- Never force push to master
- Always verify current branch with `git branch` before pushing

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
