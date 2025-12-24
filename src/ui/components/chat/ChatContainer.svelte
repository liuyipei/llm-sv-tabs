<script lang="ts">
  import { chatMessages } from '$stores/ui';
  import ChatMessage from './ChatMessage.svelte';

  let containerElement: HTMLDivElement | null = $state(null);

  // Auto-scroll to bottom when new messages arrive
  $effect(() => {
    if ($chatMessages.length > 0 && containerElement) {
      setTimeout(() => {
        containerElement?.scrollTo({
          top: containerElement.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  });
</script>

<div class="chat-container" bind:this={containerElement}>
  <div class="messages">
    {#each $chatMessages as message (message.id)}
      <ChatMessage {message} />
    {/each}
  </div>
</div>

<style>
  .chat-container {
    flex: 0 1 auto;
    overflow-y: auto;
    padding: var(--space-5);
    background-color: var(--bg-primary);
    max-height: 40%;
  }

  .messages {
    max-width: 900px;
    margin: 0 auto;
  }

  /* Scrollbar styling */
  .chat-container::-webkit-scrollbar {
    width: var(--space-5);
  }

  .chat-container::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  .chat-container::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: var(--radius-md);
  }

  .chat-container::-webkit-scrollbar-thumb:hover {
    background: var(--bg-hover);
  }
</style>
