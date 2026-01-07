<script lang="ts">
  interface Props {
    url: string;
    isLoading: boolean;
    onNavigate: (url: string) => void;
  }

  let { url, isLoading, onNavigate }: Props = $props();

  let inputValue = $state('');

  // Sync input with external URL changes
  $effect(() => {
    if (url && url !== inputValue) {
      inputValue = url;
    }
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (inputValue.trim()) {
      onNavigate(inputValue.trim());
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  }
</script>

<form class="url-bar" onsubmit={handleSubmit}>
  <input
    type="text"
    bind:value={inputValue}
    onkeydown={handleKeydown}
    placeholder="Enter URL..."
    class:loading={isLoading}
  />
  <button type="submit" disabled={!inputValue.trim() || isLoading}>
    {isLoading ? '...' : 'Go'}
  </button>
</form>

<style>
  .url-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #1e1e1e;
    border-bottom: 1px solid #3c3c3c;
  }

  input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: #3c3c3c;
    border: 1px solid #4a4a4a;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 0.875rem;
    outline: none;
  }

  input:focus {
    border-color: #0078d4;
  }

  input.loading {
    opacity: 0.7;
  }

  input::placeholder {
    color: #808080;
  }

  button {
    padding: 0.5rem 1rem;
    background: #0078d4;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #1084d8;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
