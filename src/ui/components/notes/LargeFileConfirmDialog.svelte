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
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: #cccccc;
  }

  p {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #d4d4d4;
    line-height: 1.5;
  }

  p strong {
    color: #ffffff;
    word-break: break-all;
  }

  .modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }

  .modal-actions button {
    flex: 1;
    border: none;
    border-radius: 4px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .confirm-btn {
    background-color: #007acc;
    color: white;
  }

  .confirm-btn:hover {
    background-color: #005a9e;
  }

  .cancel-btn {
    background-color: #3e3e42;
    color: #d4d4d4;
  }

  .cancel-btn:hover {
    background-color: #4e4e52;
  }

  .large-files-list {
    margin: 10px 0;
    padding-left: 20px;
    max-height: 200px;
    overflow-y: auto;
  }

  .large-files-list li {
    color: #d4d4d4;
    margin: 5px 0;
    font-size: 13px;
  }
</style>
