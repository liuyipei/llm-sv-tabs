<script lang="ts">
  import { toastStore } from '../stores/toast';
  import { fade, fly } from 'svelte/transition';

  function getTypeColor(type: string) {
    switch (type) {
      case 'success':
        return 'var(--success-green)';
      case 'error':
        return '#ef4444';
      case 'warning':
        return 'var(--warning-orange)';
      default:
        return 'var(--info-blue)';
    }
  }
</script>

<div class="toast-container">
  {#each $toastStore as toast (toast.id)}
    <div
      class="toast"
      style="border-left-color: {getTypeColor(toast.type)}"
      transition:fly={{ y: -20, duration: 300 }}
      role="button"
      tabindex="0"
      on:click={() => toastStore.dismiss(toast.id)}
      on:keydown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toastStore.dismiss(toast.id);
        }
      }}
    >
      <span class="toast-message">{toast.message}</span>
      <button class="toast-close" on:click={() => toastStore.dismiss(toast.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: var(--space-8);
    right: var(--space-8);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    pointer-events: none;
  }

  .toast {
    background: var(--bg-primary);
    color: var(--text-primary);
    padding: var(--space-6) var(--space-8);
    border-radius: var(--radius-md);
    border-left: 4px solid;
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: center;
    gap: var(--space-6);
    min-width: 300px;
    max-width: 500px;
    pointer-events: auto;
    cursor: pointer;
  }

  .toast-message {
    flex: 1;
    font-size: var(--text-base);
  }

  .toast-close {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: var(--text-2xl);
    line-height: var(--leading-tight);
    cursor: pointer;
    padding: 0;
    width: 1.25rem;
    height: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toast-close:hover {
    color: var(--text-bright);
  }
</style>
