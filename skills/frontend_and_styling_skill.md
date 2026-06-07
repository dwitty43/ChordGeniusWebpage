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
1.  **Transition & Animation Disabling**: Accidental transition or loading animations during drags cause cursor lag. When dragging is active, append `.resizing-active` to the parent container and enforce:
    ```css
    .workspace-body.resizing-active .panel-left,
    .workspace-body.resizing-active .panel-right {
        transition: none !important;
        animation: none !important;
    }
    ```
2.  **Bounds Clamping**: Constrain the panel width to prevent side panels from collapsing fully or overlaying menus (e.g. Left Panel $\ge 300\text{px}$, Right Panel $\ge 350\text{px}$).
3.  **Coordinate Math**: When computing mouse position offsets in drag event handlers, always check for undefined to prevent mobile touch coordinate collisions:
    `const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);`

### 🎬 Panel, Tab & Transition Animations
1.  **Workstation Panel Load Animations**: All main workspace panels (`.panel-left`, `.panel-right`) must fade-in and slide-up smoothly on load (`panelFadeInUp` keyframes animation) to provide a polished tab-switching visual feedback. A slight staggered delay is applied to the right panel.
2.  **Tab Switch Micro-Animations**: Inner toggled panels (such as `#liveEditor` and `#interactivePreview` inside the preview overlay, or Sign In/Sign Up forms on the login page) must use a subtle fade-in and translation micro-animation (`tabContentFadeIn` or `fadeIn`) when displayed.
3.  **Stage View Default State**: Opening any chart preview (from search, file upload, or history/setlist queue) must default to the Stage View ("Interactive Preview"). All entry points must trigger `resetModalPreviewState()` to reset modal tabs to preview mode.

---

## 🛠️ Dynamic Interactive Features

### 1. Chord Tooltip Voicing Engine
*   **Hover Event Hooks**: The chart parser surrounds chords with `span.chord-wrapper`. On mouseenter, a tooltip is generated using the `/api/chord-svg` endpoint.
*   **Voicing Modes**: The user can toggle between `guitar` and `piano` chord shapes via a header toggle. The preference is stored in `localStorage` under `cg_voicing_mode` and included in the SVG API query.
*   **Nashville Mode Suppressed Tooltips**: Tooltips are suppressed for Nashville number chords (matched by `/^[b#]?[1-7]/`) to avoid rendering invalid/blank chord diagrams.

### 2. Setlist Builder & Circular Transitions
*   **Queue Caching**: Setlists are managed as a JavaScript array and cached in `localStorage` under `cg_setlist_queue`.
*   **Transition Distances**: Consecutive cards in the setlist display distance indicators calculated via the transition APIs. If the keys are jarring (step distance $\ge 3$ on the Circle of Fifths), the UI must display a warning flag with transposition remedies.

### 3. Rehearse Auto-Scroller & Metronome (`rehearse.html`)
*   **Scroller**: Moves the viewport smoothly using `window.scrollBy({ top: scrollAmount, behavior: 'auto' })` on a recursive `requestAnimationFrame` or interval timer.
*   **Metronome Engine**: Uses Web Audio API oscillator nodes or audio samples (click tracks) scheduled precisely. Flashes a glowing border (`--primary`) on the first beat of each bar to guide musicians.

### 4. Interactive Zoom Controls
*   **Zoom Actions**: Zoom controls (`#zoomInBtn`, `#zoomOutBtn`, `#zoomLevelDisplay`) modify the interactive preview's font size. Zoom values range from 50% to 200% in 10% steps.
*   **State Persistence**: Zoom state is stored in `localStorage` under `cg_convert_zoom` and applied on initialization.

### 5. Editable Chart Title
*   **In-Place Editing**: The `#modalTitle` div has `contenteditable="true"` enabling direct title modification.
*   **Data Synchronization**: Any title edits trigger synchronization of `window.currentChartData.title` on `input` and `blur` events.

### 6. Mobile Layouts & Pane Toggling
*   **Pane Toggling (`.mobile-tabs-nav` / `.mobile-tab-btn`)**: Glassmorphism navigation tabs are sticky-docked at the top of the body panels on viewport widths under 768px.
*   **Panel Display Classes (`.mobile-hidden`)**: Handled via JavaScript click event listeners on `.mobile-tab-btn` buttons, toggling visibility between controls and rendering panels on smaller devices.
*   **Responsive Input Grids**: `.grid-inputs` collapses from 5 columns to 2 columns under 1024px, and down to 1 column under 768px to preserve input field legibility.

---

## 💡 Guidelines for Future Development Agents

1.  **Responsive Layout Integrity**: Keep columns stacked vertically on screens $< 1024\text{px}$ using CSS media queries. Hide the draggable resizer gutter entirely on mobile. Set panels (`.panel-left`, `.panel-right`, `.rehearse-left`, `.rehearse-right`, `.login-right`) to `width: 100% !important; max-width: none !important; float: none !important; flex: none !important;` under 1024px.
2.  **State Synchronization**: Synchronize user choices (e.g., zoom levels, playback speeds, instrument voicings) to `localStorage` so changes persist across page refreshes.
3.  **Layout Audit**: Prior to committing layout changes, evaluate the layout dragging logic using the browser console mock mouse events described in the UI resizer skills.
4.  **Mobile Navigation**: Ensure all mobile tab-nav elements are synchronized between the active tab classes and the panel `.mobile-hidden` class toggling.

> [!NOTE]
> **Dynamic Skill Creation & Maintenance**: As new features, subsystems, or workflows are established (e.g. databases, payment flows, or advanced authentication), developer agents are encouraged and authorized to create new skill documentation files in the `skills/` directory.
> **Self-Updating Codebase:** Whenever you add new functionality, expand APIs, or change layouts, you MUST update the corresponding skill documentation files (like `backend_and_scraper_skill.md` or `frontend_and_styling_skill.md`) to keep them current. This prevents the documentation from decaying and maintains low-token efficiency.

---
*Created by Antigravity. To refine UI modules or customize styling grids, open this file with IsSkillFile: true.*
