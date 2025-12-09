<script lang="ts">
  let { query, created, formatTimestamp } = $props<{
    query: string;
    created?: number;
    formatTimestamp: (timestamp?: number) => string;
  }>();
</script>

<div class="query-header">
  <div class="query-header-top">
    <div class="query-label">Query</div>
    {#if created}
      <div class="query-timestamp">{formatTimestamp(created)}</div>
    {/if}
  </div>
  <div class="query-text">{query}</div>
</div>
