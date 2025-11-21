<script lang="ts">
  import ChatContainer from './ChatContainer.svelte';
  import InputControls from './InputControls.svelte';
</script>

<div class="chat-view">
  <ChatContainer />
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
