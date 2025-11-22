<script lang="ts">
  import InputControls from './InputControls.svelte';
</script>

<div class="chat-view">
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
