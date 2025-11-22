# Keyboard Shortcuts

This document describes the keyboard shortcuts available in the LLM Browser application.

## Available Shortcuts

The following Chrome-like keyboard shortcuts are available:

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Ctrl+L` | Focus URL Input | Focuses and selects the URL input field (address bar equivalent) |
| `Ctrl+W` | Close Active Tab | Closes the currently active tab |
| `Ctrl+D` | Bookmark Tab | Bookmarks the currently active tab |

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
- **InputControls.svelte**: Exposes URL input focus functionality

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
