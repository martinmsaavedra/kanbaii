# KANBAII — Design System

**Version**: 1.0
**Updated**: 2026-03-26

---

## Design Philosophy

> Minimal. Dark. Fluid. Every pixel earns its place.

KANBAII follows a **futuristic Japanese-minimalist** aesthetic. Dark backgrounds, subtle borders, indigo accents. No clutter — every element serves a function. Interactions must feel instant and satisfying.

**Principles**:
1. **Zero-friction UX** — Minimum clicks to accomplish any action
2. **Information density** — Show progress, status, and context at a glance
3. **Consistent depth** — Background < Surface < Card < Elevated (layered z-depth)
4. **Motion with purpose** — Animate to communicate state changes, never for decoration

---

## 1. Design Tokens

### 1.1 Colors — Dark Theme (Default)

```css
:root {
  /* Backgrounds (layered depth) */
  --bg:               #0a0a0b;      /* App background */
  --surface:          #141417;      /* Sidebar, panels */
  --surface-hover:    #1a1a1f;      /* Hover state on surfaces */
  --surface-elevated: #111116;      /* Cards, modals base */
  --card-bg:          #111116;      /* Card background */

  /* Borders */
  --border:           #1e1e24;      /* Default borders */
  --border-light:     #2a2a32;      /* Subtle dividers */

  /* Text */
  --text:             #e4e4e7;      /* Primary text */
  --text-secondary:   #71717a;      /* Secondary text */
  --text-muted:       #52525b;      /* Muted/placeholder */

  /* Accent */
  --accent:           #6366f1;      /* Primary accent (indigo) */
  --accent-hover:     #818cf8;      /* Accent hover state */
  --accent-muted:     rgba(99, 102, 241, 0.15);  /* Accent backgrounds */

  /* Overlays */
  --overlay-bg:       rgba(0, 0, 0, 0.75);
  --shadow-modal:     0 24px 48px rgba(0, 0, 0, 0.4);

  /* Inputs */
  --modal-bg:         #111116;
  --modal-border:     rgba(255, 255, 255, 0.08);
  --input-separator:  rgba(255, 255, 255, 0.06);
  --pill-bg:          #141419;
  --select-bg:        #141419;
  --select-color:     #a1a1aa;
}
```

### 1.2 Colors — Light Theme

```css
[data-theme='light'] {
  --bg:               #f0f0f3;
  --surface:          #ffffff;
  --surface-hover:    #f5f5f7;
  --surface-elevated: #f7f7f9;
  --card-bg:          #f7f7fa;
  --border:           #d1d1d6;
  --border-light:     #b8b8c0;
  --text:             #1a1a1e;
  --text-secondary:   #3f3f46;
  --text-muted:       #6b6b76;
  --accent:           #4f46e5;
  --accent-hover:     #4338ca;
  --accent-muted:     rgba(79, 70, 229, 0.10);
  --overlay-bg:       rgba(0, 0, 0, 0.45);
  --shadow-modal:     0 24px 48px rgba(0, 0, 0, 0.12);
  --modal-bg:         #f7f7fa;
  --modal-border:     rgba(0, 0, 0, 0.10);
}
```

### 1.3 Semantic Colors

```typescript
// Category colors (hardcoded, never change)
feature:  '#6366f1'  // Indigo
bug:      '#ef4444'  // Red
refactor: '#f59e0b'  // Amber

// Status/feedback
success:  '#22c55e'  // Green
warning:  '#f59e0b'  // Amber
danger:   '#ef4444'  // Red
info:     '#3b82f6'  // Blue

// Priority dot colors
urgent:   '#f43f5e'  // Rose
high:     '#f59e0b'  // Amber
medium:   '#6366f1'  // Indigo (accent)
low:      '#71717a'  // Zinc
```

### 1.4 Typography

```css
--font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

| Use | Size | Weight | Color |
|-----|------|--------|-------|
| Page title | 20px | 600 | --text |
| Section header | 14px | 600 | --text |
| Card title | 13px | 500 | --text |
| Body text | 13px | 400 | --text |
| Secondary text | 12px | 400 | --text-secondary |
| Badge/label | 11px | 500 | varies |
| Muted/caption | 11px | 400 | --text-muted |

### 1.5 Spacing

```typescript
xs:  '4px'
sm:  '8px'
md:  '16px'
lg:  '24px'
xl:  '32px'
2xl: '48px'
```

### 1.6 Border Radius

```typescript
sm:  '8px'    // Buttons, badges, inputs
md:  '12px'   // Cards
lg:  '16px'   // Modals, panels
xl:  '20px'   // Large containers
```

### 1.7 Transitions

```typescript
fast:   '150ms ease'   // Hover states, toggles
normal: '250ms ease'   // Card interactions, panels
slow:   '350ms ease'   // Modal open/close, view transitions
```

### 1.8 Shadows

```css
/* Card hover */
--shadow-card-hover: 0 4px 12px rgba(0, 0, 0, 0.2);

/* Elevated panels */
--shadow-elevated: 0 8px 24px rgba(0, 0, 0, 0.3);

/* Modal */
--shadow-modal: 0 24px 48px rgba(0, 0, 0, 0.4);

/* Drag preview */
--shadow-drag: 0 12px 32px rgba(0, 0, 0, 0.35);
```

---

## 2. Component Specifications

### 2.1 Buttons

**Primary** (accent action):
```
bg: var(--accent) → hover: var(--accent-hover)
text: white
padding: 8px 16px
radius: var(--radius-sm)
font: 13px/500
transition: var(--fast)
active: scale(0.97)
```

**Ghost** (secondary action):
```
bg: transparent → hover: var(--surface-hover)
text: var(--text-secondary) → hover: var(--text)
border: 1px solid var(--border) → hover: var(--border-light)
```

**Danger**:
```
bg: transparent → hover: rgba(239, 68, 68, 0.12)
text: var(--text-secondary) → hover: #ef4444
```

**Icon button** (toolbar actions):
```
size: 32px × 32px
radius: var(--radius-sm)
bg: transparent → hover: var(--surface-hover)
icon: 16px, var(--text-muted) → hover: var(--text)
```

### 2.2 Inputs

```
bg: var(--surface)
border: 1px solid var(--border) → focus: var(--accent)
text: var(--text)
placeholder: var(--text-muted)
padding: 8px 12px
radius: var(--radius-sm)
font: 14px/400
```

**Textarea**: Same as input, min-height 80px, resize: vertical.

### 2.3 Badge / Pill

```
bg: {category-color} at 12% opacity
text: {category-color}
border: 1px solid {category-color} at 25% opacity
padding: 2px 8px
radius: 999px (full round)
font: 11px/500
```

### 2.4 Cards (generic)

```
bg: var(--card-bg)
border: 1px solid var(--border) → hover: var(--border-light)
radius: var(--radius-md)
padding: 12px
transition: border-color 200ms, box-shadow 200ms
hover: border-color var(--border-light), shadow-card-hover
```

### 2.5 Modal

```
overlay: var(--overlay-bg), blur(4px)
modal:
  bg: var(--modal-bg)
  border: 1px solid var(--modal-border)
  radius: var(--radius-lg)
  shadow: var(--shadow-modal)
  max-width: 560px (standard), 720px (wizard)
  padding: 24px
enter: opacity 0→1 (180ms), translateY(8px→0)
exit: opacity 1→0 (120ms)
```

### 2.6 Scrollbar

```
width: 6px
track: transparent
thumb: var(--border-light) → hover: var(--text-muted)
radius: 3px
```

---

## 3. Layout Architecture

### 3.1 App Shell

```
┌──────────────────────────────────────────────────────┐
│                     100vw × 100vh                    │
│ ┌────────┐ ┌──────────────────────────────────────┐  │
│ │        │ │                                      │  │
│ │ SIDE   │ │           MAIN CONTENT               │  │
│ │ BAR    │ │                                      │  │
│ │        │ │  (Work Items Board OR Task Board)     │  │
│ │ 240px  │ │                                      │  │
│ │ fixed  │ │         flex: 1                      │  │
│ │        │ │                                      │  │
│ └────────┘ └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

- Sidebar: fixed 240px width (collapsible to 56px on mobile)
- Main content: `flex: 1`, fills remaining space
- No page scroll — content scrolls within its container

### 3.2 Sidebar

```
┌──────────────────┐
│  K A N B A I I   │  ← Logo/brand, 48px height
│──────────────────│
│  🔍 Search...    │  ← Quick search (⌘K)
│──────────────────│
│  PROJECTS        │  ← Section header
│  ● My Project    │  ← Active project (highlighted)
│  ○ Other Project │  ← Inactive project
│  ○ Another       │
│──────────────────│
│                  │
│                  │  ← Spacer (flex: 1)
│──────────────────│
│  ⊕ New Project   │  ← Create button
│  ⚙ Settings      │  ← Settings link
│  👤 Terminal      │  ← Terminal toggle
└──────────────────┘
```

**Project Item**:
```
┌──────────────────┐
│ ● Project Name   │  ← Color dot (project color) + title
│   3 features     │  ← Work item count subtitle (secondary text)
└──────────────────┘
```

- Active project: `bg: var(--accent-muted)`, `border-left: 2px solid var(--accent)`
- Hover: `bg: var(--surface-hover)`
- Color dot: 8px circle with project color, subtle pulse if running
- Subtitle: work item count by category (e.g., "3 features, 1 bug")

### 3.3 Work Items Board (per project)

This is the main view when a project is selected. Kanban of 4 columns.

```
┌──────────────────────────────────────────────────────────────────┐
│  ← My Project                                    + New Work Item │
│  3 features · 1 bug · 1 refactor                     ⚙  🔍     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PLANNING (1)    ACTIVE (2)      REVIEW (1)      DONE (1)      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │            │  │            │  │            │  │           │ │
│  │  WI Card   │  │  WI Card   │  │  WI Card   │  │  WI Card  │ │
│  │            │  │            │  │            │  │           │ │
│  └────────────┘  ├────────────┤  └────────────┘  └───────────┘ │
│                  │            │                                  │
│                  │  WI Card   │                                  │
│                  │            │                                  │
│                  └────────────┘                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Header Bar**:
- Left: Project title (clickable breadcrumb back to project list if needed)
- Stats line: `N features · N bugs · N refactors` with category-colored dots
- Right: "+ New Work Item" button (primary), settings icon, search icon

**Column Header**:
```
PLANNING (3)                    ← Column name (uppercase, 12px/600, --text-muted) + count badge
```
- Count badge: small pill, `var(--pill-bg)`, `11px`

**Column Body**:
- `overflow-y: auto`, slim scrollbar
- `gap: 8px` between cards
- Drop zone highlight: `bg: var(--accent-muted)`, dashed border `var(--accent)`
- Empty column: centered "No work items" + ghost icon, `var(--text-muted)`

### 3.4 Work Item Card

```
┌──────────────────────────────────┐
│  ✦ Auth System            FEAT   │  ← Icon + title + category badge
│                                  │
│  Implement JWT auth with         │  ← Plan summary (2 lines max, truncated)
│  bcrypt password hashing...      │
│                                  │
│  ████████░░░░░░░  5/8  62%      │  ← Progress bar + fraction + percentage
│                                  │
│  → Login Bug                     │  ← Linked work item badge (if any)
│  ◈ opus · 2d ago                 │  ← Model + age
└──────────────────────────────────┘
```

**Layout details**:
- **Width**: fills column width (min 220px, recommended 260-300px)
- **Padding**: 12px
- **Border-radius**: var(--radius-md) = 12px
- **Background**: var(--card-bg)
- **Border**: 1px solid var(--border)
- **Hover**: border-color var(--border-light), slight shadow

**Top row** (flex, space-between):
- Left: Category icon (colored) + title (13px/500, truncate with ellipsis)
- Right: Category badge pill (FEAT/BUG/REF)

**Plan summary**:
- 12px/400, var(--text-secondary)
- `display: -webkit-box; -webkit-line-clamp: 2; overflow: hidden`
- If no plan: italic "No plan yet" in --text-muted

**Progress bar**:
- Height: 4px, radius: 2px
- Track: var(--border)
- Fill: category color (feature=indigo, bug=red, refactor=amber)
- Right of bar: `5/8` fraction (12px, --text-muted) + `62%` (12px, --text-secondary)

**Bottom row** (flex, gap: 8px):
- Linked badge (if exists): `→ Work Item Name` in 11px, --text-muted
- Model badge: `◈ opus` in 11px, --text-muted
- Age: `2d ago` in 11px, --text-muted

**States**:
- **Running** (Ralph executing): border pulses with category color glow
- **Dragging**: elevated shadow, slight scale(1.02), opacity 0.9

### 3.5 Task Board (per work item)

Entered by clicking a work item card. Full-width 5-column kanban.

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Back    ✦ Auth System    FEATURE    ████░░ 5/8       + Task  │
│            Plan ▾                                         ⚙     │
├──────────────────────────────────────────────────────────────────┤
│  ┌─ Plan Panel (collapsible) ──────────────────────────────────┐ │
│  │  Implement JWT auth with bcrypt password hashing.           │ │
│  │  1. Setup bcrypt for password hashing                       │ │
│  │  2. JWT generation and verification                         │ │
│  │  3. Auth middleware for protected routes                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  BACKLOG(2)  TODO(3)     IN PROGRESS(1)  REVIEW(1)   DONE(1)   │
│  ┌────────┐  ┌────────┐  ┌────────┐     ┌────────┐  ┌────────┐ │
│  │ Task   │  │ Task   │  │ Task   │     │ Task   │  │ Task   │ │
│  └────────┘  │        │  └────────┘     └────────┘  └────────┘ │
│  ┌────────┐  └────────┘                                        │
│  │ Task   │  ┌────────┐                                        │
│  └────────┘  │ Task   │                                        │
│              └────────┘                                        │
│              ┌────────┐                                        │
│              │ Task   │                                        │
│              └────────┘                                        │
└──────────────────────────────────────────────────────────────────┘
```

**Header**:
- "← Back" ghost button → navigates to Work Items Board
- Work item title + category icon + category badge
- Progress bar (inline, 120px wide) + fraction
- "+ Task" primary button
- Settings gear icon

**Plan Panel** (toggle with "Plan ▾" button):
- Collapsed by default (just the header)
- Expanded: shows plan content as rendered markdown
- Max height 200px, overflow-y auto
- `bg: var(--surface)`, `border: 1px solid var(--border)`, `radius: var(--radius-md)`
- Animate open/close: height transition 250ms

**Columns**: Same styling as Work Items Board columns but 5 instead of 4.

### 3.6 Task Card

```
┌──────────────────────────────┐
│  ○ Research JWT libraries    │  ← Checkbox + title
│  Compare jsonwebtoken vs...  │  ← Description (1 line, truncated)
│                              │
│  ● medium   ◈ sonnet        │  ← Priority dot + model badge
│  #research  #backend         │  ← Tags
└──────────────────────────────┘
```

**Layout**:
- Width: fills column
- Padding: 10px 12px
- Radius: var(--radius-sm) = 8px
- Background: var(--card-bg)
- Border: 1px solid var(--border)

**Checkbox**:
- 16px circle, border 1.5px var(--border-light)
- Checked: filled var(--accent), white checkmark
- Hover: border var(--accent)

**Title**: 13px/500, var(--text), 1 line truncate

**Description**: 12px/400, var(--text-secondary), 1 line truncate. Hidden if empty.

**Bottom row** (flex, gap: 6px, align: center):
- Priority dot: 6px circle, colored per priority
- Model badge: `◈ sonnet` in 11px, var(--text-muted)
- Tags: `#tag` pills, 10px, var(--pill-bg), var(--text-muted)

**States**:
- Hover: border-color var(--border-light)
- Completed: title has `text-decoration: line-through`, opacity 0.6
- Running: left border 2px solid var(--accent), subtle glow animation
- Failed: left border 2px solid #ef4444
- Dragging: elevated shadow, scale(1.02)

**Interactions**:
- Click card → TaskModal (full edit)
- Click checkbox → toggle completed
- Drag → reorder or move between columns

---

## 4. Animations & Motion

### 4.1 Card Enter (new item created)

```css
@keyframes cardSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Duration: 200ms, ease-out */
```

### 4.2 Modal Open/Close

```
Open:  overlay opacity 0→1 (180ms)
       modal translateY(8px)→0 + opacity 0→1 (200ms, ease-out)
Close: reverse, 150ms
```

### 4.3 View Transition (Work Items ↔ Task Board)

```
Exit:  current view slides left + fades out (200ms)
Enter: new view slides in from right + fades in (250ms)
```

This creates a sense of "drilling in" when entering a work item and "pulling back" when going back. Use `framer-motion` `AnimatePresence` with `layoutId` for shared elements (the work item card morphs into the task board header).

### 4.4 Drag & Drop

```
Pick up:  scale(1.02), shadow: var(--shadow-drag), opacity 0.95 (100ms)
Drop zone hover: bg: var(--accent-muted), border: dashed 1px var(--accent) (150ms)
Release:  spring animation to final position (200ms, slight overshoot)
```

### 4.5 Running Task Glow

```css
@keyframes runningGlow {
  0%, 100% { box-shadow: 0 0 4px rgba(99, 102, 241, 0.15); }
  50%      { box-shadow: 0 0 12px rgba(99, 102, 241, 0.30); }
}
/* Duration: 2s, infinite, ease-in-out */
```

### 4.6 Progress Bar Fill

```css
transition: width 500ms cubic-bezier(0.4, 0, 0.2, 1);
```

Smooth animated fill when task completes. Never jumpy.

### 4.7 Skeleton Loading

```css
@keyframes shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
/* bg: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%) */
/* Duration: 1.5s, infinite */
```

Show skeletons while data loads — matching card dimensions.

---

## 5. Wizard Modal — Step-by-Step Flow

### 5.1 Modal Structure

```
┌──────────────────────────────────────────────┐
│  Create Work Item                       ✕    │
│                                              │
│  ●───●───○───○───○                          │  ← Step indicator
│  Category  Context  Prompt  Plan  Tasks      │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │                                      │   │  ← Step content area
│  │         (varies per step)            │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                              │
│              [Skip]  [Back]  [Next →]        │  ← Navigation
└──────────────────────────────────────────────┘
```

**Modal size**: max-width 720px, min-height 480px
**Step indicator**: 5 dots connected by lines, filled = complete, outlined = current, dimmed = future

### 5.2 Step 1: Category

```
┌──────────────────────────────────────────────┐
│  What type of work item?                     │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │    ✦     │ │    ●     │ │    ◆     │    │
│  │ Feature  │ │   Bug    │ │ Refactor │    │
│  │          │ │          │ │          │    │
│  │ New      │ │ Fix      │ │ Improve  │    │
│  │ function │ │ a defect │ │ existing │    │
│  │ ality    │ │          │ │ code     │    │
│  └──────────┘ └──────────┘ └──────────┘    │
└──────────────────────────────────────────────┘
```

3 large selectable cards, each with:
- Category icon (colored, 32px)
- Category name (16px/600)
- Short description (12px, --text-secondary)
- Selected: border 2px solid {category-color}, bg: {color at 8%}

### 5.3 Step 2: Context (Bug/Refactor only)

```
┌──────────────────────────────────────────────┐
│  Link to existing feature? (optional)        │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ 🔍 Search work items...              │   │
│  ├──────────────────────────────────────┤   │
│  │ ✦ Auth System          ████░░ 62%   │   │
│  │ ✦ Payment Integration  ██░░░░ 30%   │   │
│  │ ✦ Dashboard Redesign   █░░░░░ 10%   │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  [Skip — no link needed]                     │
└──────────────────────────────────────────────┘
```

- Searchable list of existing work items (features only)
- Each shows: category icon, title, progress bar
- Click to select (highlighted border)
- "Skip" text button at bottom for opting out

For Features: this step is auto-skipped.

### 5.4 Step 3: Prompt

```
┌──────────────────────────────────────────────┐
│  Describe what you need                      │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │                                      │   │
│  │  I need a JWT authentication system  │   │
│  │  with bcrypt password hashing,       │   │
│  │  refresh tokens, and middleware      │   │
│  │  for protected routes.               │   │
│  │                                      │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  💡 Be specific about requirements,          │
│     constraints, and expected behavior       │
└──────────────────────────────────────────────┘
```

- Large textarea (min 120px height, expandable)
- Placeholder varies by category:
  - Feature: "Describe the feature, its requirements, and expected behavior..."
  - Bug: "Describe the bug, steps to reproduce, and expected vs actual behavior..."
  - Refactor: "Describe what needs improvement and the desired outcome..."
- Helper text below in --text-muted

### 5.5 Step 4: Plan (Claude-generated)

```
┌──────────────────────────────────────────────┐
│  Generated Plan                   🔄 Regen   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  ## Auth System Plan               │   │
│  │                                      │   │
│  │  ### Objective                       │   │
│  │  Implement secure JWT auth with...   │   │
│  │                                      │   │
│  │  ### Steps                           │   │
│  │  1. Setup bcrypt for passwords       │   │
│  │  2. JWT token generation/verify      │   │
│  │  3. Auth middleware                  │   │
│  │  4. Login/register routes           │   │
│  │                                      │   │
│  │  ### Considerations                  │   │
│  │  - Token refresh strategy            │   │
│  │  - Rate limiting on auth endpoints   │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  [✏ Edit manually]  [🔄 Regenerate]         │
│                      [Approve →]             │
└──────────────────────────────────────────────┘
```

- Plan rendered as markdown (read-only by default)
- "Edit manually" toggles to editable textarea
- "Regenerate" calls Claude again with optional extra instructions
- "Approve" locks the plan and moves to Step 5
- Loading state: skeleton lines with shimmer while Claude generates

### 5.6 Step 5: Tasks (Claude-generated)

```
┌──────────────────────────────────────────────┐
│  Generated Tasks                  🔄 Regen   │
│                                              │
│  ☐ Setup bcrypt hashing                      │
│    ◈ sonnet  ● medium  #auth #backend        │
│                                              │
│  ☐ Implement JWT generation                  │
│    ◈ sonnet  ● high    #auth #backend        │
│    depends: setup-bcrypt-xxxx                 │
│                                              │
│  ☐ Create auth middleware                    │
│    ◈ sonnet  ● high    #auth #backend        │
│    depends: implement-jwt-xxxx               │
│                                              │
│  ☐ Build login/register routes               │
│    ◈ sonnet  ● medium  #auth #api            │
│    depends: create-auth-middleware-xxxx       │
│                                              │
│  [+ Add task manually]                       │
│                      [Create Work Item →]    │
└──────────────────────────────────────────────┘
```

- Task list preview — each task is editable inline (click to expand)
- Shows: title, model, priority, tags, dependencies
- Can reorder via drag
- Can delete individual tasks (✕)
- "+ Add task manually" button at bottom
- "Create Work Item" creates everything and navigates to the new work item's task board

---

## 6. Empty States

### 6.1 No Projects

```
┌──────────────────────────────────────────────┐
│                                              │
│              ◇                               │
│                                              │
│     Create your first project               │
│     to get started                           │
│                                              │
│         [+ New Project]                      │
│                                              │
└──────────────────────────────────────────────┘
```

Centered, subtle, minimal. Diamond icon in --text-muted, text in --text-secondary.

### 6.2 No Work Items (project selected)

```
┌──────────────────────────────────────────────┐
│                                              │
│              ✦                               │
│                                              │
│     No work items yet                        │
│     Create a feature, report a bug,          │
│     or plan a refactor                       │
│                                              │
│     [+ New Work Item]  or  [Wizard ✨]       │
│                                              │
└──────────────────────────────────────────────┘
```

### 6.3 Empty Column

Just a subtle dashed border zone with "Drop here" text in --text-muted when dragging. Otherwise invisible.

---

## 7. Responsive Behavior

| Breakpoint | Sidebar | Columns |
|-----------|---------|---------|
| ≥1440px | 240px fixed | All columns visible, comfortable |
| 1024–1439px | 240px collapsible | All columns visible, compact |
| <1024px | Auto-collapsed to 56px (icon only) | Horizontal scroll |

**Desktop-first**. Mobile is not a priority for v1 — the app is designed for large screens where developers work.

---

## 8. Icon System

Use **Lucide React** throughout. Consistent 16px size unless specified.

| Use | Icon | Notes |
|-----|------|-------|
| Feature | Sparkle / `sparkles` | Or custom ✦ character |
| Bug | Bug / `bug` | |
| Refactor | RefreshCw / `refresh-cw` | Or custom ◆ |
| Back | ChevronLeft / `chevron-left` | |
| Add | Plus / `plus` | |
| Settings | Settings / `settings` | |
| Search | Search / `search` | |
| Close | X / `x` | |
| Delete | Trash2 / `trash-2` | |
| Edit | Pencil / `pencil` | |
| Terminal | Terminal / `terminal` | |
| Drag handle | GripVertical / `grip-vertical` | Only on hover |
| Checkbox | Circle / CheckCircle2 | Custom styled |
| Model | Diamond / `diamond` | ◈ |
| Priority | Circle (filled) | Colored per priority |
| Link | ArrowRight / `arrow-right` | For linked work items |
| Plan | FileText / `file-text` | |
| Expand | ChevronDown / `chevron-down` | Rotates on expand |

---

## 9. Color Palette Summary

```
Background layers:       #0a0a0b → #111116 → #141417 → #1a1a1f
Borders:                 #1e1e24 → #2a2a32
Text:                    #e4e4e7 → #71717a → #52525b
Accent:                  #6366f1 → #818cf8
Feature:                 #6366f1 (indigo)
Bug:                     #ef4444 (red)
Refactor:                #f59e0b (amber)
Success:                 #22c55e (green)
Priority urgent:         #f43f5e (rose)
Priority high:           #f59e0b (amber)
Priority medium:         #6366f1 (indigo)
Priority low:            #71717a (zinc)
```

All colors are chosen to be WCAG AA compliant against their background layers.
