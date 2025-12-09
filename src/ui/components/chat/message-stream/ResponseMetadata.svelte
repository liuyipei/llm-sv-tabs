<script lang="ts">
  let { model, tokensIn, tokensOut, isStreaming } = $props<{
    model?: string;
    tokensIn?: number | null;
    tokensOut?: number | null;
    isStreaming?: boolean;
  }>();

  const hasTokens = $derived(tokensIn !== undefined && tokensIn !== null && tokensOut !== undefined && tokensOut !== null);
</script>

<div class="metadata">
  {#if model}
    <span class="metadata-item"><span class="metadata-label">Model:</span> {model}</span>
  {/if}
  {#if tokensIn !== undefined && tokensIn !== null}
    <span class="metadata-item"><span class="metadata-label">Tokens In:</span> <strong>{tokensIn.toLocaleString()}</strong></span>
  {/if}
  {#if tokensOut !== undefined && tokensOut !== null}
    <span class="metadata-item"><span class="metadata-label">Tokens Out:</span> <strong>{tokensOut.toLocaleString()}</strong></span>
  {/if}
  {#if hasTokens}
    <span class="metadata-item"><span class="metadata-label">Total:</span> <strong>{((tokensIn || 0) + (tokensOut || 0)).toLocaleString()}</strong></span>
  {/if}
  {#if isStreaming}
    <span class="metadata-item streaming">● Streaming...</span>
  {/if}
</div>
