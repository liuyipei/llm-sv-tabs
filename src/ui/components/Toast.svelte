<script lang="ts">
  import { toastStore } from '../stores/toast';
  import { fade, fly } from 'svelte/transition';

  function getTypeColor(type: string) {
    switch (type) {
      case 'success':
        return '#10b981';
      case 'error':
        return '#ef4444';
      case 'warning':
        return '#f59e0b';
      default:
        return '#3b82f6';
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
    top: 16px;
    right: 16px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .toast {
    background: #1e1e1e;
    color: #e0e0e0;
    padding: 12px 16px;
    border-radius: 4px;
    border-left: 4px solid;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 300px;
    max-width: 500px;
    pointer-events: auto;
    cursor: pointer;
  }

  .toast-message {
    flex: 1;
    font-size: 14px;
  }

  .toast-close {
    background: none;
    border: none;
    color: #999;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toast-close:hover {
    color: #fff;
  }
</style>
