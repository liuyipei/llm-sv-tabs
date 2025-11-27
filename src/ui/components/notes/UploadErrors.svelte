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
    bottom: 20px;
    right: 20px;
    max-width: 400px;
    z-index: 1000;
  }

  .error-message {
    background-color: #5a1d1d;
    border: 1px solid #be1100;
    border-radius: 4px;
    padding: 12px 15px;
    margin-bottom: 10px;
    color: #f48771;
    font-size: 13px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
