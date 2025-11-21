<script lang="ts">
  import TabList from './TabList.svelte';
  import TabControls from './TabControls.svelte';
  import { tabCount } from '$stores/tabs';
</script>

<div class="tabs-section">
  <div class="section-header">
    <h2>Tabs</h2>
    <span class="tab-count">{$tabCount}</span>
  </div>
  <TabControls />
  <TabList />
</div>

<style>
  .tabs-section {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid #3e3e42;
    flex-shrink: 0;
  }

  h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #cccccc;
  }

  .tab-count {
    background-color: #3e3e42;
    color: #d4d4d4;
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 11px;
  }
</style>
