# BlockForge Pro — Documentation

> A professional visual content builder for websites, emails, flyers, and advertisements.
> Zero dependencies · No server required · Open `index.html` in any modern browser.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Workflow Diagram](#2-workflow-diagram)
3. [File Structure](#3-file-structure)
4. [Core Concepts](#4-core-concepts)
5. [Block System](#5-block-system)
6. [State Management](#6-state-management)
7. [History & Undo/Redo](#7-history--undoredo)
8. [Canvas Rendering](#8-canvas-rendering)
9. [Property Editor](#9-property-editor)
10. [Preview System](#10-preview-system)
11. [Export Pipeline](#11-export-pipeline)
12. [Touch Gesture Engine](#12-touch-gesture-engine)
13. [Multi-Select Engine](#13-multi-select-engine)
14. [Persistence](#14-persistence)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)
16. [Adding New Blocks](#16-adding-new-blocks)
17. [Adding New Templates](#17-adding-new-templates)
18. [Design Tokens](#18-design-tokens)
19. [Browser Support](#19-browser-support)
20. [Known Limitations](#20-known-limitations)

---

## 1. Architecture Overview

BlockForge Pro is a **single-page application** built with vanilla HTML, CSS, and JavaScript.
It uses no build tools, no frameworks, and no external runtime dependencies.

```
┌─────────────────────────────────────────────────────────────────┐
│                        index.html                               │
│  ┌──────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ Sidebar  │  │      Canvas Area     │  │ Properties Panel │  │
│  │          │  │                      │  │                  │  │
│  │ Blocks   │  │  ┌────────────────┐  │  │  Form controls   │  │
│  │ Layers   │  │  │  canvas-frame  │  │  │  generated from  │  │
│  │ Assets   │  │  │  (block DOM)   │  │  │  PROP_SCHEMAS    │  │
│  └──────────┘  │  └────────────────┘  │  └──────────────────┘  │
└────────────────┴──────────────────────┴─────────────────────────┘
         │                  │                        │
         ▼                  ▼                        ▼
   blocks.js           engine.js               engine.js
   BLOCK_LIBRARY       renderCanvas()          renderProps()
   BLOCK_RENDERERS     state.blocks            PROP_SCHEMAS
   PROP_SCHEMAS        snapshot()              applyBlockData()
   TEMPLATES           selectBlock()
   THEMES
         │
         ├── touch.js        (gesture engine — pinch, pan, swipe)
         └── multiselect.js  (lasso, group actions, FAB)
```

### Module Responsibilities

| File | Responsibility |
|------|---------------|
| `index.html` | Shell, CSS design system, HTML structure, panel management, boot |
| `engine.js` | State, CRUD, rendering, history, export, preview, persistence |
| `blocks.js` | Block library definitions, renderers, property schemas, templates, themes |
| `touch.js` | Touch gesture engine (pinch-zoom, pan, long-press, swipe-delete) |
| `multiselect.js` | Multi-block selection (lasso, two-finger tap, group actions, FAB) |

---

## 2. Workflow Diagram

```
╔══════════════════════════════════════════════════════════════════════╗
║                    BLOCKFORGE PRO — USER WORKFLOW                    ║
╚══════════════════════════════════════════════════════════════════════╝

  ┌─────────────┐
  │    START    │
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                    CANVAS INITIALISATION                        │
  │  init() → _loadFromStorage() → renderCanvas() → renderSidebar() │
  └──────────────────────────────┬──────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
     ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐
     │ Load Template  │  │  Drag Block  │  │   Click Block    │
     │ openTemplates()│  │  from Sidebar│  │   in Library     │
     └───────┬────────┘  └──────┬───────┘  └────────┬─────────┘
             │                  │                    │
             ▼                  ▼                    ▼
     ┌────────────────┐  ┌──────────────────────────────────────┐
     │ loadTemplate() │  │              addBlock(type)           │
     │ replaces all   │  │  • Creates block object {id,type,data}│
     │ blocks at once │  │  • Inserts after selected or at end   │
     └───────┬────────┘  │  • Calls snapshot() → renderCanvas() │
             │           │  • Calls selectBlock(id)              │
             │           └──────────────────┬───────────────────┘
             │                              │
             └──────────────┬───────────────┘
                            │
                            ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                      BLOCK ON CANVAS                            │
  │                                                                 │
  │   ┌─────────────────────────────────────────────────────────┐  │
  │   │                  block-wrapper div                       │  │
  │   │  ┌──────────┐  ┌──────────────────┐  ┌──────────────┐  │  │
  │   │  │ bw-label │  │  block-controls  │  │ block-inner  │  │  │
  │   │  │ (type+id)│  │  ↑ ↓ ⧉ ✕        │  │ (renderer    │  │  │
  │   │  └──────────┘  └──────────────────┘  │  HTML output)│  │  │
  │   │                                       └──────────────┘  │  │
  │   └─────────────────────────────────────────────────────────┘  │
  └──────────────────────────────┬──────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────────┐
              │                  │                       │
              ▼                  ▼                       ▼
     ┌────────────────┐  ┌──────────────┐  ┌────────────────────┐
     │  Click Block   │  │ Use Controls │  │  Drag to Reorder   │
     │  selectBlock() │  │  ↑↓ move     │  │  (future feature)  │
     └───────┬────────┘  │  ⧉ duplicate │  └────────────────────┘
             │           │  ✕ delete    │
             │           └──────┬───────┘
             │                  │
             ▼                  ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                    PROPERTY EDITOR                              │
  │                                                                 │
  │  renderProps() reads PROP_SCHEMAS[block.type]                   │
  │                                                                 │
  │  User edits field                                               │
  │       │                                                         │
  │       ├─ oninput  → liveUpdate() → updateBlockData()            │
  │       │             (surgical inner-HTML update, no snapshot)   │
  │       │                                                         │
  │       └─ onchange → applyBlockData()                            │
  │                     (snapshot() + inner-HTML update)            │
  └──────────────────────────────┬──────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────────┐
              │                  │                       │
              ▼                  ▼                       ▼
     ┌────────────────┐  ┌──────────────┐  ┌────────────────────┐
     │   UNDO/REDO    │  │   PREVIEW    │  │      EXPORT        │
     │                │  │              │  │                    │
     │  Ctrl+Z undo() │  │  Ctrl+P      │  │  exportAs('html')  │
     │  Ctrl+Y redo() │  │  openPreview │  │  exportAs('json')  │
     │                │  │  → iframe    │  │  downloadExport()  │
     │  history[]     │  │    render    │  │  copyExport()      │
     │  JSON snapshots│  │              │  │                    │
     └────────────────┘  └──────────────┘  └────────────────────┘
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                      PERSISTENCE                                │
  │                                                                 │
  │  saveProject()  → localStorage['blockforge_v5']                 │
  │  loadProject()  ← localStorage (v5 → v4 → v3 → v2 fallback)    │
  │  startAutoSave()→ every 30s → localStorage['blockforge_autosave']│
  └─────────────────────────────────────────────────────────────────┘


  ┌─────────────────────────────────────────────────────────────────┐
  │                   TOUCH GESTURE FLOW                            │
  │                                                                 │
  │  touchstart (2 fingers) ──► pinch-zoom + two-finger pan         │
  │  touchstart (1 finger)  ──► long-press timer starts (500ms)     │
  │                              │                                  │
  │                              ├─ finger lifts < 500ms → tap      │
  │                              └─ 500ms elapsed → SELECT MODE     │
  │                                                                 │
  │  swipe left on block    ──► swipe-delete (72px threshold)       │
  │  double-tap canvas      ──► reset zoom to 100%                  │
  │  drag on canvas bg      ──► lasso rubber-band selection         │
  └─────────────────────────────────────────────────────────────────┘


  ┌─────────────────────────────────────────────────────────────────┐
  │                  MULTI-SELECT FLOW                              │
  │                                                                 │
  │  Ctrl+A / two-finger tap / lasso drag                           │
  │       │                                                         │
  │       ▼                                                         │
  │  MS.selected (Set<string>)  ←──── toggleSelect(id)              │
  │       │                                                         │
  │       ▼                                                         │
  │  refreshSelectionStyles()   ←──── ms-selected / ms-dimmed CSS   │
  │       │                                                         │
  │       ▼                                                         │
  │  updateFAB()  ──► Floating Action Bar appears                   │
  │                    │                                            │
  │                    ├─ Duplicate  → groupDuplicate()             │
  │                    ├─ Move Up    → groupMoveUp()                │
  │                    ├─ Move Down  → groupMoveDown()              │
  │                    ├─ Copy       → groupCopy()                  │
  │                    ├─ Paste      → groupPaste()                 │
  │                    └─ Delete     → groupDelete()                │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 3. File Structure

```
content-system/
├── index.html          Main application shell
│                       • CSS design system (design tokens, layout, components)
│                       • HTML structure (toolbar, sidebar, canvas, props panel)
│                       • Panel management (open/close, mobile overlays)
│                       • Boot sequence
│
├── engine.js           Core application engine (§1–§18 documented inline)
│                       • §1  Application state
│                       • §2  History (undo/redo)
│                       • §3  Block CRUD
│                       • §4  Canvas rendering (diff-aware reconciler)
│                       • §5  Properties panel
│                       • §6  Sidebar
│                       • §7  Drag & drop
│                       • §8  Canvas mode & zoom
│                       • §9  Preview mode
│                       • §10 Theme application
│                       • §11 Templates
│                       • §12 Export pipeline
│                       • §13 Persistence
│                       • §14 Modal system
│                       • §15 Toast notifications
│                       • §16 Keyboard shortcuts
│                       • §17 Utility functions
│                       • §18 Initialisation
│
├── blocks.js           Block definitions (no DOM access)
│                       • BLOCK_LIBRARY   — sidebar categories + metadata
│                       • BLOCK_RENDERERS — type → HTML string functions
│                       • PROP_SCHEMAS    — type → field definitions
│                       • TEMPLATES       — pre-built page layouts
│                       • THEMES          — colour theme presets
│
├── touch.js            Touch gesture engine (IIFE, no globals except BFTouch)
│                       • Pinch-to-zoom with pivot tracking
│                       • Two-finger pan with momentum physics
│                       • Long-press block selection (500ms)
│                       • Swipe-left-to-delete (72px / 0.35px·ms⁻¹)
│                       • Double-tap zoom reset
│                       • First-time gesture hint overlay
│
├── multiselect.js      Multi-block selection engine (IIFE, exposes MSEngine)
│                       • Two-finger tap toggle
│                       • Lasso rubber-band (touch + mouse)
│                       • Floating Action Bar (draggable)
│                       • Group: duplicate, move, copy, paste, delete
│                       • Keyboard: Ctrl+A, Ctrl+C, Ctrl+V, Del
│
└── README.md           This file
```

---

## 4. Core Concepts

### Block

A block is the fundamental unit of content. Every block is a plain JavaScript object:

```javascript
{
  id:   'b1k2m3n4',   // Unique ID — base-36 timestamp + random suffix
  type: 'hero',        // Must exist as a key in BLOCK_RENDERERS
  data: {              // Property values — shape defined by PROP_SCHEMAS[type]
    title:    'Hello World',
    bg:       'linear-gradient(135deg,#6366f1,#ec4899)',
    btnText:  'Get Started',
  }
}
```

### Renderer

A renderer is a pure function `(data) => htmlString`. It receives the block's `data` object and returns an HTML string. Renderers must be **pure** — no side effects, no DOM access.

```javascript
// Example renderer
BLOCK_RENDERERS.heading = (d) => `
  <div style="padding:${d.padding||'24px 40px'}">
    <${d.tag||'h2'} style="color:${d.color||'#111'}">${d.text||'Heading'}</${d.tag||'h2'}>
  </div>`;
```

### Property Schema

A schema is an array of field descriptors that drives the property editor UI:

```javascript
PROP_SCHEMAS.heading = [
  { section: 'Content' },
  { key: 'text',  label: 'Text',      type: 'text'   },
  { key: 'tag',   label: 'HTML Tag',  type: 'select', options: ['h1','h2','h3','h4'] },
  { section: 'Style' },
  { key: 'color', label: 'Color',     type: 'color'  },
  { key: 'size',  label: 'Font Size', type: 'text'   },
];
```

**Field types:**

| Type | UI Control | Notes |
|------|-----------|-------|
| `text` | `<input type="text">` | General string values |
| `textarea` | `<textarea>` | Multi-line text, HTML |
| `color` | Color picker + hex input | Synced bidirectionally |
| `gradient` | `<input type="text">` | CSS gradient or hex |
| `select` | `<select>` | Requires `options: string[]` |
| `toggle` | Custom toggle switch | Boolean values |
| `range` | `<input type="range">` | Requires `min`, `max`, `step`, `unit` |

---

## 5. Block System

### Block Library Categories

| Category | Blocks |
|----------|--------|
| Layout | Hero, 2/3/4 Columns, Section, Container, Divider, Spacer |
| Content | Heading, Paragraph, Quote, List, Badge, Code, Table |
| Media | Image, Video, Icon, Avatar, Gallery, Logo |
| UI Components | Button, Card, Feature, Pricing, Testimonial, Stats, Progress, Accordion, Tabs, Alert, Badge Group, Timeline |
| Navigation | Navbar, Footer, Breadcrumb, Pagination |
| Forms | Contact Form, Newsletter, Search, Input Field |
| Marketing | CTA Banner, Ad Banner, Countdown, Social Links |

### Canvas Modes

| Mode | Width | Use Case |
|------|-------|----------|
| Web | 1160px | Full website pages |
| Email | 600px | HTML email newsletters |
| Flyer | 794px | A4 print / digital flyers |
| Ad | 400px | Display advertisements |

---

## 6. State Management

All application state lives in a single `state` object in `engine.js`.
State is **never mutated directly from outside engine.js** — all changes go through the exported functions.

```javascript
const state = {
  blocks:       [],        // Block[]  — ordered canvas blocks
  selected:     null,      // string|null — selected block ID
  mode:         'web',     // canvas mode
  editorMode:   'design',  // editor mode
  zoom:         100,       // 25–200
  history:      [],        // string[] — JSON snapshots
  historyIndex: -1,        // current position in history
  dragType:     null,      // block type being dragged
  sidebarTab:   'blocks',  // active sidebar tab
  previewOpen:  false,     // preview overlay state
  searchQuery:  '',        // block search filter
  darkCanvas:   false,     // canvas background mode
};
```

### State Mutation Rules

1. **Only engine.js functions mutate state** — never access `state` from HTML `onclick` attributes except through the exported API
2. **Always call `snapshot()` after mutations** that should be undoable
3. **Call `renderCanvas()` after any change** to `state.blocks`
4. **Call `renderProps()` after any change** to `state.selected` or block data

---

## 7. History & Undo/Redo

The history system uses a **linear snapshot stack** — a simple, reliable approach that works well for document editors.

```
history array:  [ snap0, snap1, snap2, snap3, snap4 ]
                                              ▲
                                        historyIndex = 4

After undo:     [ snap0, snap1, snap2, snap3, snap4 ]
                                        ▲
                                  historyIndex = 3

After new action (truncates redo future):
                [ snap0, snap1, snap2, snap3, snap5 ]
                                              ▲
                                        historyIndex = 4
```

**Key properties:**
- Maximum 100 snapshots (configurable)
- Deduplication: consecutive identical snapshots are skipped
- Each snapshot is `JSON.stringify(state.blocks)` — ~1–10KB per snapshot
- `liveUpdate()` (on `input`) does NOT snapshot — only `applyBlockData()` (on `change`) does

---

## 8. Canvas Rendering

The canvas uses a **diff-aware DOM reconciler** — similar in principle to a virtual DOM, but simpler because blocks are always a flat ordered list.

```
renderCanvas() algorithm:
  1. Build lookup map of existing DOM wrappers by ID
  2. Remove wrappers whose IDs are no longer in state.blocks
  3. For each block in state.blocks (in order):
     a. If wrapper exists → update selection class, update label
     b. If wrapper missing → create new wrapper, append to container
     c. Ensure DOM order matches state.blocks order (insertBefore)
  4. Update block count badge
```

**Why not innerHTML?**
Replacing `innerHTML` on the container would destroy all event listeners and cause unnecessary reflow. The reconciler only touches changed nodes.

**Block wrapper structure:**
```html
<div class="block-wrapper [selected]" id="bw-{id}" data-type="{type}">
  <div class="bw-label">          <!-- Type name + short ID -->
  <div class="block-controls">    <!-- ↑ ↓ ⧉ ✕ buttons -->
  <div class="block-inner">       <!-- Renderer HTML output -->
</div>
```

---

## 9. Property Editor

The property editor is generated dynamically from `PROP_SCHEMAS[block.type]`.

**Two-phase update pattern:**

```
User types in input
      │
      ├─ oninput → liveUpdate(id, key, value)
      │              └─ updateBlockData() — surgical inner-HTML update
      │                 NO snapshot (avoids history spam while typing)
      │
      └─ onchange → applyBlockData(id)
                     └─ snapshot() + inner-HTML update
                        (commits to history on blur/enter)
```

**Color field sync:**
The color field renders both a `<input type="color">` (visual picker) and a `<input type="text">` (hex value). They are kept in sync bidirectionally via `syncColorText()` and `syncColorPicker()`.

---

## 10. Preview System

The preview opens a full-screen overlay containing a sandboxed `<iframe>`.

```
openPreview()
  │
  ├─ Builds complete HTML document string (_buildPreviewDocument)
  │   • Includes Google Fonts link
  │   • Includes responsive CSS overrides
  │   • Concatenates all block renderer outputs
  │
  ├─ Writes document into iframe via contentDocument.write()
  │
  ├─ Opens overlay with CSS transition
  │
  └─ Resets editor mode button to "Design"

Device switching (setPreviewDevice):
  • desktop → iframe width: 100%
  • tablet  → iframe width: 768px, centered, rounded corners
  • mobile  → iframe width: 375px, phone bezel CSS effect
```

**Security:** The iframe uses `sandbox="allow-scripts allow-same-origin"` — scripts in the preview can run (needed for interactive blocks) but cannot access parent frame data.

---

## 11. Export Pipeline

```
exportAs('html')
  │
  ├─ Calls each block's renderer with its data
  ├─ Concatenates HTML strings
  ├─ Wraps in full HTML document (_buildExportDocument)
  │   • Includes fonts, reset CSS, responsive overrides
  └─ Displays in modal code viewer

exportAs('json')
  │
  └─ JSON.stringify({ version, mode, blocks })
     Preserves all block data for re-import

downloadExport()
  │
  ├─ Creates Blob from code viewer content
  ├─ Creates temporary <a> element
  ├─ Triggers download
  └─ Revokes object URL (memory cleanup)
```

---

## 12. Touch Gesture Engine

`touch.js` is an **IIFE** (Immediately Invoked Function Expression) that attaches to the canvas scroll area. It exposes a minimal public API via `window.BFTouch`.

### Gesture Detection

| Gesture | Detection Method | Action |
|---------|-----------------|--------|
| Pinch zoom | `touches.length === 2` + distance delta | Scale canvas frame |
| Two-finger pan | `touches.length === 2` + midpoint delta | Scroll canvas |
| Momentum | Velocity tracking on touchend | Continue scroll with friction |
| Long press | 500ms timer, cancelled if moved > 8px | Select block |
| Swipe left | `|dx| > |dy| × 1.5` + 72px threshold | Delete block |
| Double tap | Two taps within 280ms | Reset zoom to 100% |

### Zoom Implementation

```
Pinch zoom with fixed pivot:
  1. Track midpoint between two fingers (pivot point)
  2. Calculate new zoom = startZoom × (currentDist / startDist)
  3. Adjust scrollLeft/scrollTop so pivot stays visually fixed:
     scrollLeft = pivotX × scale - (pivotClientX - containerLeft)
  4. Snap to clean values: 50%, 75%, 100%, 125%, 150%, 200%
```

### Public API

```javascript
BFTouch.getZoom()          // → number (current zoom 0.35–3.0)
BFTouch.setZoom(value)     // Set zoom with center-screen pivot
BFTouch.resetZoom()        // Reset to 1.0
BFTouch.showHint()         // Show first-time gesture hint overlay
```

---

## 13. Multi-Select Engine

`multiselect.js` is an **IIFE** that exposes `window.MSEngine`.

### Selection Methods

| Method | Trigger | Behaviour |
|--------|---------|-----------|
| Two-finger tap | Both fingers on same block | Toggle that block |
| Two-finger tap | Fingers on different blocks | Toggle both |
| Lasso (touch) | Single-finger drag on canvas background | Rubber-band select |
| Lasso (mouse) | Click-drag on canvas background | Rubber-band select |
| Ctrl+A | Keyboard | Select all blocks |
| Click background | Mouse | Clear selection |

### Lasso Algorithm

```
1. Detect drag start on canvas background (not on a block)
2. Draw lasso rectangle (absolute positioned div in canvas-frame)
3. On each move: recalculate lasso rect in canvas coordinates
4. For each block: check if intersection area ≥ 30% of block area
5. Add/remove from MS.selected Set accordingly
6. On touchend/mouseup: commit selection, hide lasso
```

The 30% containment threshold prevents accidental selection when the lasso barely clips a block edge.

### Floating Action Bar

The FAB is a fixed-position element that:
- Appears with spring animation when `MS.selected.size > 0`
- Is **draggable** — grab the badge area to reposition
- Respects `env(safe-area-inset-bottom)` for iOS home indicator
- Switches to a vertical layout in landscape orientation on phones

### Public API

```javascript
MSEngine.getSelected()     // → Set<string> of selected block IDs
MSEngine.clearSelection()  // Deselect all
MSEngine.selectAll()       // Select all blocks
MSEngine.toggleSelect(id)  // Toggle one block
MSEngine.groupDelete()     // Delete all selected (with confirmation)
MSEngine.groupDuplicate()  // Duplicate all selected
MSEngine.groupMoveUp()     // Move group up one position
MSEngine.groupMoveDown()   // Move group down one position
MSEngine.groupCopy()       // Copy to in-memory clipboard
MSEngine.groupPaste()      // Paste from clipboard
MSEngine.hasSelection()    // → boolean
MSEngine.count()           // → number of selected blocks
```

---

## 14. Persistence

### Storage Keys

| Key | Content | Written by |
|-----|---------|-----------|
| `blockforge_v5` | Full project (version, mode, blocks, savedAt) | `saveProject()` |
| `blockforge_autosave` | Blocks + timestamp | Auto-save (every 30s) |

### Migration

`loadProject()` and `_loadFromStorage()` check keys in order:
`blockforge_v5` → `blockforge_v4` → `blockforge_v3` → `blockforge_v2` → `blockforge_project`

This ensures projects saved by older versions of BlockForge Pro are automatically migrated.

### Data Format (v5)

```json
{
  "version": "5.0",
  "mode": "web",
  "savedAt": "2026-06-28T12:00:00.000Z",
  "blocks": [
    {
      "id": "b1k2m3n4",
      "type": "hero",
      "data": {
        "title": "Hello World",
        "bg": "linear-gradient(135deg,#6366f1,#ec4899)"
      }
    }
  ]
}
```

---

## 15. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save project |
| `Ctrl+D` | Duplicate selected block |
| `Ctrl+P` | Open preview |
| `Ctrl+T` | Open templates |
| `Ctrl+A` | Select all (multi-select) |
| `Ctrl+C` | Copy selected group |
| `Ctrl+V` | Paste group |
| `Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom |
| `↑` | Move selected block up |
| `↓` | Move selected block down |
| `Tab` | Select next block |
| `Shift+Tab` | Select previous block |
| `Delete` / `Backspace` | Delete selected block |
| `Escape` | Close preview / modal / deselect |
| `B` | Toggle sidebar |

---

## 16. Adding New Blocks

To add a new block type, edit `blocks.js` in three places:

### Step 1 — Add to BLOCK_LIBRARY

```javascript
// In the appropriate category object:
"UI Components": [
  // ... existing blocks ...
  { id: "my-block", icon: "🎯", label: "My Block" },
],
```

### Step 2 — Add a Renderer

```javascript
// In BLOCK_RENDERERS:
BLOCK_RENDERERS['my-block'] = (d) => `
  <div style="padding:${d.padding||'24px 40px'};background:${d.bg||'#fff'}">
    <h3 style="color:${d.color||'#111'}">${d.title||'My Block Title'}</h3>
    <p>${d.text||'My block description.'}</p>
  </div>`;
```

**Renderer rules:**
- Must be a **pure function** — no DOM access, no side effects
- Must handle missing data gracefully (use `||` defaults for every property)
- Must return a valid HTML string
- Inline styles only — no external CSS classes (for export portability)

### Step 3 — Add a Property Schema

```javascript
// In PROP_SCHEMAS:
PROP_SCHEMAS['my-block'] = [
  { section: 'Content' },
  { key: 'title',   label: 'Title',       type: 'text'     },
  { key: 'text',    label: 'Description', type: 'textarea' },
  { section: 'Style' },
  { key: 'bg',      label: 'Background',  type: 'color'    },
  { key: 'color',   label: 'Text Color',  type: 'color'    },
  { key: 'padding', label: 'Padding',     type: 'text'     },
];
```

That's it — the block will appear in the sidebar, be draggable, and have a working property editor automatically.

---

## 17. Adding New Templates

Templates are defined in the `TEMPLATES` array in `blocks.js`:

```javascript
TEMPLATES.push({
  id:     'my-template',          // Unique ID
  name:   'My Template',          // Display name
  icon:   '🚀',                   // Emoji icon
  desc:   'A great template',     // Short description
  color:  'linear-gradient(135deg,#6366f1,#8b5cf6)', // Thumbnail gradient
  blocks: [
    { type: 'navbar',      data: { brand: 'MyBrand' } },
    { type: 'hero',        data: { title: 'Welcome', btnText: 'Start' } },
    { type: 'section',     data: { title: 'Features' } },
    { type: 'cta',         data: { title: 'Get Started' } },
    { type: 'footer',      data: { brand: 'MyBrand' } },
  ],
});
```

Each block in the template's `blocks` array uses the same `{ type, data }` shape as canvas blocks. The `data` values become the block's initial property values.

---

## 18. Design Tokens

All visual values are defined as CSS custom properties in `index.html`:

```css
:root {
  /* Brand colours */
  --primary:       #6366f1;   /* Indigo — primary actions */
  --primary-dark:  #4f46e5;   /* Hover state */
  --primary-light: #a5b4fc;   /* Subtle accents */
  --secondary:     #ec4899;   /* Pink — brand gradient */
  --success:       #10b981;   /* Green — confirmations */
  --warning:       #f59e0b;   /* Amber — cautions */
  --danger:        #ef4444;   /* Red — destructive actions */

  /* Background scale (dark → light) */
  --bg0: #080810;   /* Deepest background */
  --bg1: #0f0f18;   /* Toolbar / sidebar */
  --bg2: #141420;   /* Modal backgrounds */
  --bg3: #1b1b28;   /* Input backgrounds */
  --bg4: #222232;   /* Hover states */
  --bg5: #2a2a3e;   /* Active states */

  /* Border opacity scale */
  --b1: rgba(255,255,255,.055);  /* Subtle dividers */
  --b2: rgba(255,255,255,.10);   /* Standard borders */
  --b3: rgba(255,255,255,.18);   /* Emphasis borders */

  /* Text scale */
  --t1: #eeeef8;   /* Primary text */
  --t2: #9090b0;   /* Secondary text */
  --t3: #55556a;   /* Muted text */
  --t4: #38384a;   /* Disabled text */

  /* Border radius scale */
  --r-xs: 4px;   --r-sm: 6px;   --r: 10px;
  --r-lg: 16px;  --r-xl: 22px;

  /* Shadows */
  --shadow-sm: 0 2px 8px rgba(0,0,0,.5);
  --shadow:    0 8px 32px rgba(0,0,0,.6);
  --shadow-lg: 0 24px 80px rgba(0,0,0,.7);

  /* Animation */
  --ease: cubic-bezier(.4,0,.2,1);
  --t:    .18s;    /* Standard transition */
  --t-lg: .35s;   /* Slow transition (panels, modals) */

  /* Layout */
  --tb:  54px;    /* Toolbar height */
  --stb: 40px;    /* Sub-toolbar height */
  --sb:  264px;   /* Sidebar width */
  --pp:  292px;   /* Properties panel width */
}
```

To retheme the editor UI, change these values. Block content uses its own inline styles and is unaffected.

---

## 19. Browser Support

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 90+ | Full support including all touch gestures |
| Firefox | 88+ | Full support; `navigator.vibrate` not supported |
| Safari | 14+ | Full support; `navigator.vibrate` not supported |
| Edge | 90+ | Full support |
| Safari iOS | 14+ | Full touch support; haptics via vibrate not available |
| Chrome Android | 90+ | Full touch + haptic support |

**Required APIs:**
- `CSS Custom Properties` (variables)
- `CSS Grid` and `Flexbox`
- `localStorage`
- `Clipboard API` (for copy — graceful fallback if unavailable)
- `navigator.vibrate` (optional — haptics on Android only)
- `ResizeObserver` (not currently used but available)
- `IntersectionObserver` (not currently used but available)

---

## 20. Known Limitations

| Limitation | Impact | Workaround |
|-----------|--------|-----------|
| Block content uses inline styles | Exported HTML is verbose | Acceptable for portability |
| No real-time collaboration | Single user only | Save/load JSON to share |
| localStorage ~5MB limit | Large projects may fail to save | Export JSON as backup |
| iframe preview can't load external resources in some browsers | Fonts may not load in preview | Use the Download button and open locally |
| Drag-to-reorder blocks | Not yet implemented | Use ↑↓ buttons or layer panel |
| `navigator.vibrate` iOS | No haptic feedback on iPhone | Visual feedback compensates |
| Block renderers use inline styles | Cannot be overridden by external CSS | By design — ensures export portability |
| No image upload | Images require URLs | Use Unsplash, Pexels, or your own CDN |

---

## Quick Start

```
1. Open index.html in Chrome, Firefox, Safari, or Edge
2. Click "Templates" to load a pre-built layout, OR
   drag any block from the left sidebar onto the canvas
3. Click a block to select it and edit its properties in the right panel
4. Use Ctrl+P (or the ▶ Preview button) to see the full rendered page
5. Use Ctrl+S to save your project to the browser
6. Click Export → HTML to get a standalone HTML file
```

---

*BlockForge Pro — Built with ❤️ using vanilla HTML, CSS, and JavaScript.*
*No frameworks. No build tools. No dependencies. Just open and build.*