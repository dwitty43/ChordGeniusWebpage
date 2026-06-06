# 🎓 Skill: ChordGenius Frontend Development, UI Resizing & Styling Standards

This document defines the client-side engineering structures, design token systems, and interactive UI behaviors for the ChordGenius frontend dashboard. Following this skill ensures layout consistency, visual excellence, contrast compliance, and smooth user interactions.

---

## 📂 Frontend File Architecture
*   [public/index.html](file:///c:/Users/Dwitt/Projects/ChordGeniusWebpage/public/index.html): The primary workstation ("Convert" interface) containing the Search, Upload, Live Editor, Setlist Builder, and Chord Tooltip widgets.
*   [public/rehearse.html](file:///c:/Users/Dwitt/Projects/ChordGeniusWebpage/public/rehearse.html): The performance workstation ("Rehearse" page) containing the auto-scrolling engine, audio metronome, and on-the-fly transposition controls.
*   [public/styles.css](file:///c:/Users/Dwitt/Projects/ChordGeniusWebpage/public/styles.css): The unified stylesheet containing theme color tokens, custom scrollbars, transitions, and CSS layouts.
*   [public/premium.html](file:///c:/Users/Dwitt/Projects/ChordGeniusWebpage/public/premium.html) & [public/login.html](file:///c:/Users/Dwitt/Projects/ChordGeniusWebpage/public/login.html): Secondary pages for billing simulation and user accounts.

---

## 🎨 Theme System & CSS Tokens (`styles.css`)

ChordGenius uses HSL color systems to manage dark and light themes dynamically. The theme is toggled by changing the `data-theme` attribute on the root `<html>` element.

### Root Color Tokens (Dark Mode Default)
```css
:root {
    --bg-dark: hsl(222, 19%, 8%);
    --bg-card: hsl(222, 19%, 12%);
    --primary: hsl(38, 92%, 50%);         /* Glowing Gold */
    --primary-glow: hsla(38, 92%, 50%, 0.15);
    --border: hsl(222, 12%, 18%);
    --text: hsl(210, 20%, 98%);
    --text-muted: hsl(215, 15%, 65%);
}
```

### Contrast Safety Rules
1.  **Light Mode Overrides**: When updating elements for Light Mode (`[data-theme="light"]`), ensure background-to-text contrast matches WCAG AA standards.
2.  **No Background Shorthand Overrides**: To update colors/gradients, use `background-image` or `background-color` specifically. Avoid the `background` shorthand as it resets `background-clip`, breaking gradient clipping on headers and brand logos.
3.  **Badge Text Contrast**: Outlined badges must retain `background-clip: padding-box !important` and `-webkit-text-fill-color: var(--primary) !important` to stay legible.

---

## 📐 Draggable Resizer & Pane Layouts

The workstation uses a multi-pane grid that supports mouse dragging on desktop screens to resize side-by-side workspace divisions.

### Resizer Gutter Injection
The resizer element must sit between resizable panels:
```html
<div class="resize-gutter" id="workspaceResizer"></div>
```

### Dragging Smoothness Checklist
1.  **Transition Disabling**: Accidental transition animations during drags cause cursor lag. When dragging is active, append `.resizing-active` to the parent container and enforce:
    ```css
    .workspace-body.resizing-active .panel-left,
    .workspace-body.resizing-active .panel-right {
        transition: none !important;
    }
    ```
2.  **Bounds Clamping**: Constrain the panel width to prevent side panels from collapsing fully or overlaying menus (e.g. Left Panel $\ge 300\text{px}$, Right Panel $\ge 350\text{px}$).
3.  **Coordinate Math**: When computing mouse position offsets in drag event handlers, always check for undefined to prevent mobile touch coordinate collisions:
    `const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);`

---

## 🛠️ Dynamic Interactive Features

### 1. Chord Tooltip Voicing Engine
*   **Hover Event Hooks**: The chart parser surrounds chords with `span.chord-wrapper`. On mouseenter, a tooltip is generated using the `/api/chord-svg` endpoint.
*   **Voicing Modes**: The user can toggle between `guitar` and `piano` chord shapes via a header toggle. The preference is stored in `localStorage` under `cg_voicing_mode` and included in the SVG API query.

### 2. Setlist Builder & Circular Transitions
*   **Queue Caching**: Setlists are managed as a JavaScript array and cached in `localStorage` under `cg_setlist_queue`.
*   **Transition Distances**: Consecutive cards in the setlist display distance indicators calculated via the transition APIs. If the keys are jarring (step distance $\ge 3$ on the Circle of Fifths), the UI must display a warning flag with transposition remedies.

### 3. Rehearse Auto-Scroller & Metronome (`rehearse.html`)
*   **Scroller**: Moves the viewport smoothly using `window.scrollBy({ top: scrollAmount, behavior: 'auto' })` on a recursive `requestAnimationFrame` or interval timer.
*   **Metronome Engine**: Uses Web Audio API oscillator nodes or audio samples (click tracks) scheduled precisely. Flashes a glowing border (`--primary`) on the first beat of each bar to guide musicians.

---

## 💡 Guidelines for Future Development Agents

1.  **Responsive Layout Integrity**: Keep columns stacked vertically on screens $< 1024\text{px}$ using CSS media queries. Hide the draggable resizer gutter entirely on mobile.
2.  **State Synchronization**: Synchronize user choices (e.g., zoom levels, playback speeds, instrument voicings) to `localStorage` so changes persist across page refreshes.
3.  **Layout Audit**: Prior to committing layout changes, evaluate the layout dragging logic using the browser console mock mouse events described in the UI resizer skills.

> [!NOTE]
> **Dynamic Skill Creation & Maintenance**: As new features, subsystems, or workflows are established (e.g. databases, payment flows, or advanced authentication), developer agents are encouraged and authorized to create new skill documentation files in the `skills/` directory.
> **Self-Updating Codebase:** Whenever you add new functionality, expand APIs, or change layouts, you MUST update the corresponding skill documentation files (like `backend_and_scraper_skill.md` or `frontend_and_styling_skill.md`) to keep them current. This prevents the documentation from decaying and maintains low-token efficiency.

---
*Created by Antigravity. To refine UI modules or customize styling grids, open this file with IsSkillFile: true.*
