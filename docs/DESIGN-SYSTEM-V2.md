# KANBAII — Design System V2

**Vision**: Futuristic developer tool. Think Linear meets Raycast. Ultra-dark, glass-like surfaces, indigo energy accents. Every pixel earns its place.

---

## 1. Core Visual Identity

### Philosophy
- **Glass-dark**: Surfaces feel like tinted glass, not flat panels
- **Depth through light**: Use subtle inner glows and gradient borders instead of heavy shadows
- **Accent as energy**: Indigo (#6366f1) is the "power" color — it glows, pulses, activates
- **Typography-first**: Let text and whitespace do the work, not decorations
- **Micro-motion**: Everything responds. Nothing is static.

### What changes from V1
| Element | V1 (Current) | V2 (New) |
|---------|-------------|----------|
| Backgrounds | Flat solid colors | Subtle radial gradients |
| Card borders | `1px solid #1e1e24` | `1px solid rgba(255,255,255,0.06)` with glow on hover |
| Card hover | Border color change | Translate-up + shadow + border glow |
| Modals | Flat backdrop | Blur + saturate glassmorphism |
| Buttons | Flat accent bg | Gradient + glow on hover |
| Inputs | Flat surface bg | Darker recessed look with focus glow ring |
| Progress bars | 4px thick | 3px, smoother animation curve |
| Column headers | Uppercase muted | Smaller, more spacing, monospaced count |
| Sidebar | Flat surface | Semi-transparent with border glow when busy |

---

## 2. Color Palette — Dark Theme

### Backgrounds (glass-dark layers)
```
--bg:               #09090b      App background (near-black)
--surface:          #0f0f12      Sidebar, panels (glass-dark)
--surface-hover:    #16161b      Hover state
--surface-elevated: #111115      Cards, modals
--card-bg:          #111115      Card background
```

### Borders (transparent, not hex)
```
--border:           rgba(255, 255, 255, 0.06)    Default
--border-light:     rgba(255, 255, 255, 0.10)    Hover
--border-focus:     rgba(99, 102, 241, 0.50)     Focus ring
```

### Text (high contrast hierarchy)
```
--text:             #ececef      Primary (near-white, not pure white)
--text-secondary:   #8b8b95      Labels, secondary info
--text-muted:       #55555e      Placeholders, disabled
```

### Accent — Indigo energy
```
--accent:           #6366f1      Primary interaction
--accent-hover:     #818cf8      Hover state
--accent-muted:     rgba(99, 102, 241, 0.10)    Subtle bg
--accent-glow:      rgba(99, 102, 241, 0.20)    Hover glow
```

---

## 3. Typography

### Font
Inter — weight 300 (logo), 400 (body), 500 (labels), 600 (titles), 700 (emphasis)

### Scale
```
Logo text:      17px / 300 / 0.15em spacing / gradient fill
Page title:     18px / 600 / -0.01em tracking
Section title:  15px / 600 / -0.01em tracking
Card title:     13px / 500 / normal
Body text:      13px / 400 / normal
Label:          11px / 600 / 0.06em spacing / uppercase
Badge:          10px / 600 / 0.02em spacing / uppercase
Caption:        10px / 400 / normal
Mono (output):  10px / Consolas / line-height 1.6
```

---

## 4. Spacing

```
4px   xs    (badge padding, tiny gaps)
6px         (card gap between items)
8px   sm    (inner padding, button gaps)
12px        (card padding horizontal)
14px        (card padding vertical)
16px  md    (section gaps)
20px        (form field gaps)
24px  lg    (container padding)
28px        (modal padding)
32px  xl    (large gaps)
```

---

## 5. Border Radius

```
4px   xs    (tags, small pills)
6px         (inner elements)
8px   sm    (buttons, inputs)
12px  md    (cards)
16px  lg    (modals, panels)
20px  xl    (large containers)
999px       (pills, badges)
```

---

## 6. Shadows (layered depth)

```
Card:         0 1px 3px rgba(0,0,0,0.2), 0 0 0 1px var(--border)
Card hover:   0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px var(--border-light)
Elevated:     0 8px 32px rgba(0,0,0,0.4)
Modal:        0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)
Drag:         0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px var(--accent)
Toast:        0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)
```

---

## 7. Transitions

```
Fast:     120ms ease         (hover, toggle)
Normal:   200ms ease         (layout changes)
Slow:     300ms ease         (view transitions)
Spring:   300ms cubic-bezier(0.16, 1, 0.3, 1)   (modal enter, card pop)
```

---

## 8. Interactive States

### Card hover
- `transform: translateY(-1px)` — subtle lift
- Shadow deepens from card → card-hover
- Border brightens from 6% → 10% white opacity

### Card drag
- `opacity: 0.35; transform: scale(0.97) rotate(1deg)`
- Accent outline appears

### Button hover (primary)
- Glow: `box-shadow: 0 0 16px var(--accent-glow)`
- Background lightens to accent-hover

### Input focus
- Border shifts to accent
- Glow ring: `box-shadow: 0 0 0 3px var(--accent-muted)`

### Modal enter
- Overlay: `blur(8px) saturate(150%)`
- Modal: `scale(0.98) → scale(1)` with spring curve

---

## 9. Component Patterns

### Card (generic)
```css
background: var(--card-bg);
border: 1px solid var(--border);
border-radius: 12px;
padding: 14px 16px;
transition: all 200ms ease;
```

### Column header
```css
font-size: 11px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.06em;
color: var(--text-muted);
```

### Badge
```css
font-size: 10px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.02em;
padding: 2px 7px;
border-radius: 999px;
background: rgba(color, 0.10);
border: 1px solid rgba(color, 0.20);
```

### Modal label
```css
font-size: 11px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.06em;
color: var(--text-muted);
margin-bottom: 8px;
```

---

## 10. Animation Principles

1. **Entrance**: Always from slightly below + transparent (`translateY(6px), opacity: 0`)
2. **Exit**: Fade only, no movement (faster: 150ms)
3. **Hover**: Instant response (120ms), subtle lift
4. **Running state**: Slow pulse (2-2.5s), indigo glow
5. **Success**: Brief green flash
6. **Drag**: Scale down + rotate + accent outline
7. **Drop zone**: Accent-muted bg + dashed accent outline
