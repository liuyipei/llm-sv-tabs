<script lang="ts">
  import type { ChatMessage } from '../../../types';

  let { message }: { message: ChatMessage } = $props();

  const isUser = $derived(message.role === 'user');
  const isAssistant = $derived(message.role === 'assistant');
</script>

<div class="chat-message" class:user={isUser} class:assistant={isAssistant}>
  <div class="message-header">
    <span class="role">{isUser ? 'You' : 'Assistant'}</span>
  </div>
  <div class="message-content">
    {message.content}
  </div>
</div>

<style>
  .chat-message {
    margin-bottom: 20px;
    padding: 15px;
    border-radius: 8px;
    background-color: #2d2d30;
  }

  .chat-message.user {
    background-color: #094771;
    margin-left: 20%;
  }

  .chat-message.assistant {
    background-color: #2d2d30;
    margin-right: 20%;
  }

  .message-header {
    margin-bottom: 8px;
  }

  .role {
    font-size: 12px;
    font-weight: 600;
    color: #007acc;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chat-message.user .role {
    color: #4fc3f7;
  }

  .message-content {
    font-size: 14px;
    line-height: 1.6;
    color: #d4d4d4;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
