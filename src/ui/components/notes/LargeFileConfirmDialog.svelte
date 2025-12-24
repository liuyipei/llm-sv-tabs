<script lang="ts">
  import Modal from '../common/Modal.svelte';
  import { formatFileSize } from '$utils/file-utils';

  type Props = {
    files: File[];
    onconfirm: () => void;
    oncancel: () => void;
  };

  let { files, onconfirm, oncancel }: Props = $props();
</script>

<Modal onclose={oncancel} ariaLabel="Large file warning">
  <h3>Large File Warning</h3>
  {#if files.length === 1}
    <p>
      The file <strong>{files[0].name}</strong> is {formatFileSize(files[0].size)}.
    </p>
    <p>This exceeds the recommended size limit of 50 MB. Do you want to continue?</p>
  {:else}
    <p>
      You are trying to upload <strong>{files.length} files</strong> that exceed the recommended size limit of 50 MB:
    </p>
    <ul class="large-files-list">
      {#each files as file}
        <li>{file.name} ({formatFileSize(file.size)})</li>
      {/each}
    </ul>
    <p>Do you want to continue?</p>
  {/if}
  <div class="modal-actions">
    <button onclick={onconfirm} class="confirm-btn">Upload Anyway</button>
    <button onclick={oncancel} class="cancel-btn">Cancel</button>
  </div>
</Modal>

<style>
  h3 {
    margin: 0 0 var(--space-8) 0;
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: var(--text-primary);
  }

  p {
    margin: 0 0 var(--space-6) 0;
    font-size: var(--text-base);
    color: var(--text-primary);
    line-height: var(--leading-relaxed);
  }

  p strong {
    color: var(--text-bright);
    word-break: break-all;
  }

  .modal-actions {
    display: flex;
    gap: var(--space-5);
    margin-top: var(--space-9);
  }

  .modal-actions button {
    flex: 1;
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-5) var(--space-9);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .confirm-btn {
    background-color: var(--accent-color);
    color: var(--text-bright);
  }

  .confirm-btn:hover,
  .confirm-btn:focus-visible {
    background-color: var(--accent-hover);
    outline: none;
  }

  .cancel-btn {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  .cancel-btn:hover,
  .cancel-btn:focus-visible {
    background-color: var(--bg-input);
    outline: none;
  }

  .large-files-list {
    margin: var(--space-5) 0;
    padding-left: var(--space-9);
    max-height: 200px;
    overflow-y: auto;
  }

  .large-files-list li {
    color: var(--text-primary);
    margin: var(--space-2) 0;
    font-size: var(--text-md);
  }
</style>
