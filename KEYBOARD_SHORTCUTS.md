# Keyboard Shortcuts

This document describes the keyboard shortcuts available in the LLM Browser application.

## Available Shortcuts

The following keyboard shortcuts are available, combining Chrome conventions with LLM-specific features:

### Tab Management
| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+W` | Close Active Tab | Closes the currently active tab (not the window) |
| `Ctrl+T` | New Tab | Opens a new tab by focusing the URL bar |
| `Ctrl+Tab` | Next Tab | Switches to the next tab |
| `Ctrl+Shift+Tab` | Previous Tab | Switches to the previous tab |

### Navigation
| Shortcut | Action | Description |
|----------|--------|-------------|
| `Alt+Left` | Go Back | Navigate back in history |
| `Alt+Right` | Go Forward | Navigate forward in history |
| `Ctrl+R` | Reload | Reload the current tab |
| `Ctrl+L` | Focus URL Input | Focuses and selects the URL input field (address bar) |

### Search
| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+F` | Find in Page | Opens the find-in-page search bar |

### LLM Features
| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+.` | **Focus LLM Input** | Focuses the LLM query input (primary AI feature) |
| `Ctrl+Alt+S` | Screenshot | Capture a screen region for LLM analysis |

### Other Actions
| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+D` | Bookmark Tab | Bookmarks the currently active tab |
| `Esc` | Return to Page Content | Returns focus to the active WebContents view from anywhere in the UI unless another handler consumes the key |

> **Note**: On macOS, use `Cmd` instead of `Ctrl` for all shortcuts.

> **Note**: `Ctrl+.` follows the modern standard for AI sidebars, similar to Microsoft Edge Copilot. It's easy to hit with one hand but hard to trigger accidentally.

## Implementation

The keyboard shortcuts system is structured into separate files for better organization:

### Configuration File
- **Location**: `src/ui/config/shortcuts.ts`
- **Purpose**: Contains the keyboard shortcut definitions
- **Features**:
  - Declarative shortcut configuration
  - Shortcut matching logic
  - Display formatting utilities

### Handler Utility
- **Location**: `src/ui/utils/keyboard-shortcuts.ts`
- **Purpose**: Manages keyboard event listeners and action dispatch
- **Features**:
  - Event listener initialization
  - Action routing
  - Cleanup function for unmounting

### Integration
- **App.svelte**: Initializes keyboard shortcuts on mount and defines action handlers
- **InputControls.svelte**: Exposes URL input and LLM query input focus functionality

## Adding New Shortcuts

To add a new keyboard shortcut:

1. **Add the shortcut configuration** in `src/ui/config/shortcuts.ts`:
   ```typescript
   {
     key: 'n',
     ctrl: true,
     description: 'Open new tab',
     action: 'openNewTab',
   }
   ```

2. **Update the ShortcutAction interface**:
   ```typescript
   export interface ShortcutAction {
     focusUrlInput: () => void;
     focusLLMInput: () => void;
     closeActiveTab: () => void;
     bookmarkActiveTab: () => void;
     openNewTab: () => void; // Add new action
   }
   ```

3. **Implement the action handler** in `src/ui/App.svelte`:
   ```typescript
   async function openNewTab(): Promise<void> {
     // Implementation here
   }
   ```

4. **Add to the initKeyboardShortcuts call**:
   ```typescript
   initKeyboardShortcuts({
     focusUrlInput,
     focusLLMInput,
     closeActiveTab,
     bookmarkActiveTab,
     openNewTab, // Add new action
   });
   ```

## Architecture Benefits

The current architecture provides several benefits:

1. **Separation of Concerns**: Shortcuts configuration is separate from implementation
2. **Easy Maintenance**: All shortcuts are defined in one centralized location
3. **Type Safety**: TypeScript interfaces ensure action handlers are properly implemented
4. **Extensibility**: New shortcuts can be added without modifying core logic
5. **Testability**: Configuration and handlers can be tested independently
