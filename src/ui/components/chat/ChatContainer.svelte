<script>
  import { chatMessages } from '$stores/ui';
  import ChatMessage from './ChatMessage.svelte';
</script>

<div class="chat-container">
  {#if $chatMessages.length === 0}
    <div class="empty-state">
      <h2>Welcome to LLM Browser</h2>
      <p>Enter a query to interact with your tabs using LLM</p>
    </div>
  {:else}
    <div class="messages">
      {#each $chatMessages as message (message.id)}
        <ChatMessage {message} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .chat-container {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background-color: #1e1e1e;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #808080;
    text-align: center;
  }

  .empty-state h2 {
    margin: 0 0 10px 0;
    font-size: 24px;
    font-weight: 400;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
    color: #606060;
  }

  .messages {
    max-width: 900px;
    margin: 0 auto;
  }

  /* Scrollbar styling */
  .chat-container::-webkit-scrollbar {
    width: 10px;
  }

  .chat-container::-webkit-scrollbar-track {
    background: #1e1e1e;
  }

  .chat-container::-webkit-scrollbar-thumb {
    background: #3e3e42;
    border-radius: 5px;
  }

  .chat-container::-webkit-scrollbar-thumb:hover {
    background: #4e4e52;
  }
</style>
