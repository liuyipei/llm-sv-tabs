<script lang="ts">
  import type { ContextTabInfo } from '../../../../types';

  let { contextTabs } = $props<{ contextTabs: Array<ContextTabInfo & { favicon?: string }> }>();
</script>

{#if contextTabs.length > 0}
  <div class="context-section">
    <div class="context-label">Context ({contextTabs.length} tab{contextTabs.length === 1 ? '' : 's'})</div>
    <div class="context-tabs">
      {#each contextTabs as contextTab}
        <div class="context-tab-item">
          <div class="context-tab-header">
            <div class="context-tab-title-container">
              {#if contextTab.favicon}
                <img src={contextTab.favicon} alt="" class="context-tab-favicon" />
              {/if}
              <span class="context-tab-title">{contextTab.title}</span>
            </div>
            <span class="context-tab-type">{contextTab.type}</span>
          </div>
          {#if contextTab.url && contextTab.url !== 'about:blank'}
            <div class="context-tab-url">{contextTab.url}</div>
          {/if}
          {#if contextTab.slug || contextTab.shortId}
            <div class="context-tab-ids">
              {#if contextTab.slug}
                <span class="context-id">slug: {contextTab.slug}</span>
              {/if}
              {#if contextTab.shortId}
                <span class="context-id">id: {contextTab.shortId}</span>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}
