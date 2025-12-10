<script lang="ts">
  import InputControls from './InputControls.svelte';
  import ModelQuickSwitch from './ModelQuickSwitch.svelte';
</script>

<div class="chat-view">
  <ModelQuickSwitch />
  <InputControls />
</div>

<style>
  .chat-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
</style>
