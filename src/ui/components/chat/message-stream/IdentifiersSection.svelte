<script lang="ts">
  let { slug, shortId, persistentId } = $props<{
    slug?: string;
    shortId?: string;
    persistentId?: string;
  }>();

  const showIdentifiers = $derived(Boolean(slug || shortId || persistentId));
</script>

{#if showIdentifiers}
  <div class="identifiers-section">
    <div class="identifiers-label">Tab Identifiers</div>
    <div class="identifiers-list">
      {#if slug}
        <div class="identifier-row"><span class="identifier-label">Slug:</span> <span class="identifier-value">{slug}</span></div>
      {/if}
      {#if shortId}
        <div class="identifier-row"><span class="identifier-label">Short ID:</span> <span class="identifier-value">{shortId}</span></div>
      {/if}
      {#if persistentId}
        <div class="identifier-row"><span class="identifier-label">UUID:</span> <span class="identifier-value">{persistentId}</span></div>
      {/if}
    </div>
  </div>
{/if}
