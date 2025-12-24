<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  type Props = {
    onclose?: () => void;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    ariaLabel?: string;
    children?: Snippet;
  };

  let {
    onclose,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    ariaLabel = 'Dialog',
    children
  }: Props = $props();

  function handleOverlayClick(): void {
    if (closeOnOverlayClick && onclose) {
      onclose();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (closeOnEscape && event.key === 'Escape' && onclose) {
      onclose();
    }
  }

  onMount(() => {
    if (closeOnEscape) {
      window.addEventListener('keydown', handleKeydown);
      return () => {
        window.removeEventListener('keydown', handleKeydown);
      };
    }
    return undefined;
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="modal-overlay"
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
  role="presentation"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    class="modal-content"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="dialog"
    aria-label={ariaLabel}
    aria-modal="true"
  >
    {@render children?.()}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
  }

  .modal-content {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--space-10);
    max-width: 500px;
    width: 90%;
    box-shadow: var(--shadow-lg);
  }
</style>
