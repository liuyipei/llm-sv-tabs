<script lang="ts">
  import TabList from './TabList.svelte';
  import TabControls from './TabControls.svelte';
  import { tabCount } from '$stores/tabs';
</script>

<div class="tabs-section">
  <TabControls tabCount={$tabCount} />
  <TabList />
</div>

<style>
  .tabs-section {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
</style>
