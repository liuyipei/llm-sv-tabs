<script lang="ts">
  type Props = {
    errors: string[];
  };

  let { errors }: Props = $props();
</script>

{#if errors.length > 0}
  <div class="upload-errors">
    {#each errors as error}
      <div class="error-message">{error}</div>
    {/each}
  </div>
{/if}

<style>
  .upload-errors {
    position: fixed;
    bottom: var(--space-9);
    right: var(--space-9);
    max-width: 400px;
    z-index: var(--z-modal);
  }

  .error-message {
    background-color: var(--error-bg);
    border: 1px solid var(--danger-red);
    border-radius: var(--radius-md);
    padding: var(--space-6) var(--space-7);
    margin-bottom: var(--space-5);
    color: var(--error-text);
    font-size: var(--text-md);
    box-shadow: var(--shadow-md);
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
