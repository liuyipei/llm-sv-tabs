# Design System

**Status:** Post-hoc documentation (extracted from existing codebase)
**Compliance:** Browser does not yet fully adhere to this system—this document serves as a reference for future refactoring.

---

## Overview

This design system documents the visual language of the LLM Browser. It provides a single source of truth for colors, typography, spacing, and other design tokens used throughout the application.

**Important:** This is a *post-hoc* design system—extracted from existing code rather than defined upfront. As such, there are inconsistencies in the current implementation (e.g., hardcoded colors instead of CSS variables, non-uniform spacing). Future work should migrate components to use these standardized values.

---

## Color Palette

### Background Colors

| Token | Value | Usage |
|-------|-------|-------|
| `bg-primary` | `#1e1e1e` | Main application background, darkest surface |
| `bg-surface-1` | `#252526` | Raised surfaces (sidebar, URL bar, modal content) |
| `bg-surface-2` | `#2d2d30` | Elevated elements (table headers, tab items) |
| `bg-input` | `#3c3c3c` | Input fields, textareas, code inline backgrounds |
| `bg-hover` | `#3e3e42` | Hover states on neutral elements |
| `bg-hover-subtle` | `rgba(255, 255, 255, 0.05)` | Subtle hover on editable text |

### Text Colors

| Token | Value | Usage |
|-------|-------|-------|
| `text-primary` | `#d4d4d4` | Primary body text |
| `text-bright` | `#ffffff` | Headings (h1-h6) |
| `text-secondary` | `#8c8c8c` | Muted/secondary text (timestamps, blockquotes) |
| `text-tertiary` | `#808080` | URLs, very muted content |
| `text-disabled` | `#606060` | Disabled button text |

### Accent Colors

| Token | Value | Usage |
|-------|-------|-------|
| `accent-blue` | `#007acc` | Primary interactive color (buttons, active tabs, focus states) |
| `accent-blue-hover` | `#005a9e` | Hover state for primary buttons |
| `accent-blue-muted` | `#094771` | Active tab background |
| `link-blue` | `#3794ff` | Markdown links |

### Semantic Colors (VSCode-inspired)

| Token | Value | Usage | VSCode Origin |
|-------|-------|-------|---------------|
| `semantic-purple` | `#c586c0` | Context sections, variables | Keyword/variable |
| `semantic-cyan` | `#4ec9b0` | Responses, success, identifiers | String/type |
| `semantic-light-blue` | `#569cd6` | Identifier sections | Function |
| `semantic-sky` | `#9cdcfe` | Metadata labels, tab type badges | Parameter |
| `semantic-yellow` | `#dcdcaa` | Metadata values, identifier values | Constant |

### Feedback Colors

| Token | Value | Usage |
|-------|-------|-------|
| `error-text` | `#f48771` | Error messages, error borders |
| `error-bg` | `#5a1d1d` | Error message background |
| `danger-red` | `#e81123` | Destructive actions (close button hover, danger menu items) |
| `success-green` | `#10b981` | Success toast border |
| `warning-orange` | `#f59e0b` | Warning toast border |
| `info-blue` | `#3b82f6` | Info toast border |
| `warning-bg` | `rgba(244, 135, 113, 0.15)` | Warning message background |
| `warning-border` | `rgba(244, 135, 113, 0.5)` | Warning message border |

### Search Highlights

| Token | Value | Usage |
|-------|-------|-------|
| `search-highlight-inactive` | `#5a4d00` | Inactive search match background |
| `search-highlight-active` | `#ff9632` | Active search match background |
| `search-highlight-active-text` | `#000` | Active search match text color |

### Border Colors

| Token | Value | Usage |
|-------|-------|-------|
| `border-default` | `#3e3e42` | Standard borders, dividers |
| `border-focus` | `#007acc` | Focused input borders |

---

## Typography

### Font Families

```css
--font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', system-ui, sans-serif;
--font-mono: 'Consolas', 'Monaco', 'Courier New', monospace;
```

**Usage:**
- `font-system`: All UI text (buttons, labels, paragraphs)
- `font-mono`: Code blocks, URLs, identifiers, technical values

### Font Sizes

| Token | Value | Usage |
|-------|-------|-------|
| `text-xs` | `10px` | Tab URLs, very small labels |
| `text-sm` | `12px` | Tab titles, small UI elements |
| `text-base` | `14px` | **Base size** - inputs, buttons, body text, toasts |
| `text-md` | `13px` | Context menu items |
| `text-lg` | `16px` | Icon buttons |
| `text-xl` | `18px` | Large buttons, navigation arrows |
| `text-2xl` | `24px` | Toast close button |

**Markdown heading scale:**
- `h1`: `2em` (32px at base 16px)
- `h2`: `1.5em` (24px)
- `h3-h6`: Inherit with adjusted margins

**Special sizes:**
- Inline code: `85%` of parent
- Labels (uppercase): `0.75rem` (12px) with `letter-spacing: 0.5px`

### Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| `font-regular` | `400` | Default text |
| `font-medium` | `500` | Tab titles, metadata labels, medium emphasis |
| `font-semibold` | `600` | Section labels (uppercase), headings, table headers, strong text |
| `font-bold` | `700` | (Currently unused, reserved) |

### Line Heights

| Token | Value | Usage |
|-------|-------|-------|
| `leading-tight` | `1` | Buttons, icon elements |
| `leading-snug` | `1.25` | Headings |
| `leading-normal` | `1.4` | Warnings, compact text |
| `leading-relaxed` | `1.5` | Body text, paragraphs |

### Letter Spacing

- **Uppercase labels:** `0.5px` (used for `.query-label`, `.context-label`, etc.)
- **Default:** `normal` (0)

---

## Spacing Scale

| Token | Value | Usage Examples |
|-------|-------|----------------|
| `space-0` | `0` | Reset margins/padding |
| `space-1` | `2px` | Minimal spacing (tab title margins) |
| `space-2` | `4px` | Tight gaps (list items, menu dividers) |
| `space-3` | `6px` | Small padding (tab items) |
| `space-4` | `8px` | Standard small gap (URL bar, checkboxes, inputs) |
| `space-5` | `10px` | Medium padding (inputs, textareas) |
| `space-6` | `12px` | Standard medium (table cells, buttons) |
| `space-7` | `15px` | Input controls padding |
| `space-8` | `16px` | Large padding (toasts, code blocks, margins) |
| `space-9` | `20px` | Extra large (button padding) |
| `space-10` | `24px` | Modal padding, heading margins |

**Note:** Current codebase uses inconsistent spacing (3px, 15px exist alongside the scale). Future refactoring should normalize to the primary scale: 2, 4, 8, 12, 16, 20, 24.

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | `2px` | Search highlights, small badges |
| `radius-default` | `3px` | Tab items, inline code, badges, icon buttons |
| `radius-md` | `4px` | Standard - inputs, buttons, cards, sections |
| `radius-lg` | `6px` | Modals, code blocks |

---

## Shadows

```css
--shadow-sm: 0 4px 6px rgba(0, 0, 0, 0.3);    /* Toasts */
--shadow-md: 0 4px 8px rgba(0, 0, 0, 0.3);    /* Context menus */
--shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.5);   /* Modals */
```

**Usage:**
- `shadow-sm`: Floating notifications
- `shadow-md`: Dropdowns, context menus
- `shadow-lg`: Modal dialogs, overlays

---

## Transitions

| Token | Value | Usage |
|-------|-------|-------|
| `transition-fast` | `0.2s` | Standard UI transitions (background-color, opacity, transform) |
| `transition-medium` | `300ms` | Animations (toast fly-in, Svelte transitions) |

**Easing:** Default is `ease` (not explicitly specified in current code)

**Common patterns:**
```css
transition: background-color 0.2s;
transition: all 0.2s;
```

---

## Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `z-base` | `0` | Default layer |
| `z-divider-dragging` | `1000` | Resizable divider when actively dragging |
| `z-modal` | `1000` | Modal overlays, context menus |
| `z-toast` | `10000` | Toast notifications (always on top) |

---

## Layout Constants

### Sidebar

- **Width:** `350px` (fixed, not resizable)
- **Resizable split:** 60/40 default (top panel / bottom tabs list)
  - Clamp range: 20% - 80%
  - Divider height: `4px`

### URL Bar

- **Height:** `53px` (approximately, derived from padding + input height)
- **Input height:** `36px`
- **Button height:** `36px`

### Main Window

- **Default dimensions:** `1400 x 900px` (typical)
- **Minimum size:** (not specified in design docs—check main process config)

### Resizable Dividers

- **Thickness:** `4px`
- **Default color:** `#3e3e42`
- **Hover/drag color:** `#007acc`
- **Keyboard adjustment step:** `5%`

---

## Component Patterns

### Buttons

**Primary button:**
```css
background-color: #007acc;
color: white;
border: none;
border-radius: 4px;
padding: 8px 20px;
font-size: 14px;
font-weight: 500;
cursor: pointer;
transition: background-color 0.2s;
```
Hover: `background-color: #005a9e`

**Disabled state:**
```css
background-color: #3e3e42;
color: #808080;
cursor: not-allowed;
```

**Icon button (e.g., refresh, close):**
```css
background: none;
border: none;
color: #d4d4d4;
font-size: 16-18px;
width: 20px;
height: 20px;
border-radius: 3px;
opacity: 0.6;
transition: all 0.2s;
```
Hover: `opacity: 1; background-color: #007acc` (or `#e81123` for close)

**Navigation button:**
```css
background-color: #3c3c3c;
color: #d4d4d4;
border: 1px solid #3e3e42;
border-radius: 4px;
padding: 6px 12px;
```
Hover: `background-color: #4e4e52; border-color: #007acc`
Disabled: `background-color: #2d2d30; color: #606060`

### Inputs

**Text input / Textarea:**
```css
background-color: #3c3c3c;
color: #d4d4d4;
border: 1px solid #3e3e42;
border-radius: 4px;
padding: 8-10px 12px;
font-family: inherit;
font-size: 14px;
```
Focus: `border-color: #007acc; outline: none`

**Editable title input:**
```css
background-color: #3c3c3c;
border: 1px solid #007acc; /* Always focused appearance */
border-radius: 2px;
padding: 1px 4px;
```

### Cards & Sections

**Standard card pattern (used in MessageStream):**
```css
background-color: #1e1e1e;
border-left: 3px solid <semantic-color>; /* Blue, purple, cyan, etc. */
border-radius: 4px;
padding: 0.75rem;
margin-bottom: 1.5rem;
```

**Raised surface:**
```css
background-color: #252526;
padding: 1rem;
border-radius: 4px;
```

### Tabs

**Tab item (inactive):**
```css
padding: 6px 8px;
margin-bottom: 3px;
background-color: #2d2d30;
border-radius: 3px;
```

**Tab item (hover):**
```css
background-color: #3e3e42;
```

**Tab item (active):**
```css
background-color: #094771;
border-left: 3px solid #007acc;
```

### Modals

**Overlay:**
```css
position: fixed;
top: 0; left: 0; right: 0; bottom: 0;
background-color: rgba(0, 0, 0, 0.7);
z-index: 1000;
```

**Content:**
```css
background-color: #252526;
border: 1px solid #3e3e42;
border-radius: 6px;
padding: 24px;
max-width: 500px;
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
```

### Toasts

```css
background: #1e1e1e;
color: #e0e0e0;
padding: 12px 16px;
border-radius: 4px;
border-left: 4px solid <type-color>;
box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
min-width: 300px;
max-width: 500px;
```

**Position:** `fixed; top: 16px; right: 16px; z-index: 10000`

### Context Menus

```css
position: fixed;
background-color: #2d2d30;
border: 1px solid #3e3e42;
border-radius: 4px;
box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
z-index: 1000;
min-width: 150px;
padding: 4px 0;
```

**Menu item:**
```css
padding: 8px 16px;
font-size: 13px;
color: #d4d4d4;
background: none;
border: none;
```
Hover: `background-color: #3e3e42`
Danger hover: `background-color: #e81123; color: white`

**Divider:**
```css
height: 1px;
background-color: #3e3e42;
margin: 4px 0;
```

---

## Markdown Rendering Styles

**Used in `.llm-message-stream` for LLM response display:**

### Headings

```css
h1, h2, h3, h4, h5, h6 {
  color: #ffffff;
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

h1 {
  font-size: 2em;
  border-bottom: 1px solid #3e3e42;
  padding-bottom: 0.3em;
}

h2 {
  font-size: 1.5em;
  border-bottom: 1px solid #3e3e42;
  padding-bottom: 0.3em;
}
```

### Code Blocks

**Inline code:**
```css
background-color: #3c3c3c;
padding: 0.2em 0.4em;
border-radius: 3px;
font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
font-size: 85%;
```

**Code block (pre):**
```css
background-color: #1e1e1e;
border: 1px solid #3e3e42;
border-radius: 6px;
padding: 16px;
overflow-x: auto;
margin-bottom: 16px;
```

### Blockquotes

```css
border-left: 4px solid #3e3e42;
padding-left: 16px;
color: #8c8c8c;
margin: 0 0 16px 0;
```

### Tables

**Table:**
```css
border-collapse: collapse;
width: 100%;
margin-bottom: 16px;
```

**Cells:**
```css
th, td {
  border: 1px solid #3e3e42;
  padding: 8px 12px;
  text-align: left;
}

th {
  background-color: #2d2d30;
  font-weight: 600;
}
```

### Links

```css
a {
  color: #3794ff;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
```

### Lists

```css
ul, ol {
  padding-left: 2em;
  margin-bottom: 16px;
}

li {
  margin-bottom: 4px;
}
```

### Images

```css
img {
  max-width: 100%;
  height: auto;
}
```

---

## Accessibility

### Focus States

**Standard focus outline:**
```css
outline: 2px solid #007acc;
outline-offset: -2px;
```

Used on resizable dividers, buttons, inputs when focused via keyboard.

### ARIA Labels

- All interactive elements should have `aria-label` or `title` attributes
- Modal components use `role="dialog"` with `aria-modal="true"`
- Context menus use `role="menu"` with menu items as `role="menuitem"`
- Resizable dividers use `role="separator"` with `aria-orientation`

### Keyboard Navigation

- Tab order follows logical flow
- Interactive elements are keyboard-accessible (`tabindex="0"`)
- Escape key closes modals and context menus
- Enter/Space triggers buttons and actions

---

## Design Tokens (Future CSS Variables)

**Note:** Current implementation uses hardcoded colors. Future refactoring should convert to CSS custom properties:

```css
:root {
  /* Colors */
  --color-bg-primary: #1e1e1e;
  --color-bg-surface-1: #252526;
  --color-bg-surface-2: #2d2d30;
  --color-bg-input: #3c3c3c;

  --color-text-primary: #d4d4d4;
  --color-text-secondary: #8c8c8c;
  --color-text-bright: #ffffff;

  --color-accent-blue: #007acc;
  --color-accent-blue-hover: #005a9e;

  --color-border-default: #3e3e42;
  --color-border-focus: #007acc;

  /* ... etc ... */

  /* Spacing */
  --space-1: 2px;
  --space-2: 4px;
  --space-4: 8px;
  --space-6: 12px;
  --space-8: 16px;
  --space-10: 24px;

  /* Typography */
  --font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', system-ui, sans-serif;
  --font-mono: 'Consolas', 'Monaco', 'Courier New', monospace;

  --text-xs: 10px;
  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;

  /* Radius */
  --radius-sm: 2px;
  --radius-default: 3px;
  --radius-md: 4px;
  --radius-lg: 6px;

  /* Shadows */
  --shadow-sm: 0 4px 6px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.5);

  /* Z-index */
  --z-modal: 1000;
  --z-toast: 10000;
}
```

---

## Known Inconsistencies

These issues should be addressed in future refactoring:

1. **Hardcoded colors:** Most components use inline hex values instead of CSS variables
2. **Spacing irregularities:** 3px, 15px, and other non-scale values exist
3. **Font size mixing:** Some components use `px`, others use `rem` or `em`
4. **Multiple primary backgrounds:** Both `#1e1e1e` and `#252526` are used as "main" backgrounds in different contexts
5. **Button styles:** Not all buttons follow the same base pattern (icon buttons vs. primary vs. navigation)
6. **Border colors:** `#3e3e42` is used for both borders and hover backgrounds, creating ambiguity

---

## Migration Strategy (Recommended)

To bring the codebase into alignment with this design system:

1. **Phase 1:** Create CSS variable definitions in a `styles/tokens.css` file
2. **Phase 2:** Refactor high-impact components first:
   - Button variants (primary, secondary, icon, danger)
   - Input components (text, textarea)
   - Card/section wrappers
3. **Phase 3:** Normalize spacing across all components
4. **Phase 4:** Create component base classes (e.g., `.btn-primary`, `.card`, `.input`)
5. **Phase 5:** Audit for accessibility and color contrast compliance

---

## Future Enhancements

Features not currently implemented but reserved in the design system:

- **Light theme:** Inverse color palette with high contrast
- **Theme switching:** Toggle between dark/light modes with CSS variable override
- **Color customization:** User-configurable accent colors
- **Reduced motion:** Respect `prefers-reduced-motion` for accessibility
- **High contrast mode:** Enhanced borders and colors for low vision users

---

## References

This design system is inspired by:
- **VSCode Dark+ Theme** (color palette, semantic colors)
- **GitHub Dark Theme** (markdown rendering)
- **Tailwind CSS** (spacing scale philosophy)

**Last Updated:** 2025-12-23
**Version:** 1.0.0 (Initial post-hoc documentation)
