<script lang="ts">
  import { formatFileSize } from '$utils/file-utils';

  type Props = {
    files: File[];
    onconfirm: () => void;
    oncancel: () => void;
  };

  let { files, onconfirm, oncancel }: Props = $props();
</script>

<div class="modal-overlay" onclick={oncancel}>
  <div class="modal-content" onclick={(e) => e.stopPropagation()}>
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
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background-color: #252526;
    border: 1px solid #3e3e42;
    border-radius: 6px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .modal-content h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: #cccccc;
  }

  .modal-content p {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #d4d4d4;
    line-height: 1.5;
  }

  .modal-content p strong {
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
