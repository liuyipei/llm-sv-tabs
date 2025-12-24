<script lang="ts">
  type Props = {
    current: number;
    total: number;
    fileName: string;
  };

  let { current, total, fileName }: Props = $props();
</script>

<div class="upload-progress">
  <div class="progress-text">
    Uploading file {current} of {total}...
  </div>
  <div class="progress-filename">{fileName}</div>
  <div class="progress-bar">
    <div class="progress-fill" style="width: {(current / total) * 100}%"></div>
  </div>
</div>

<style>
  .upload-progress {
    position: fixed;
    bottom: var(--space-9);
    right: var(--space-9);
    background-color: var(--bg-secondary);
    border: 1px solid var(--accent-color);
    border-radius: var(--radius-lg);
    padding: var(--space-7) var(--space-9);
    min-width: 300px;
    box-shadow: var(--shadow-lg);
    z-index: var(--z-modal);
  }

  .progress-text {
    color: var(--text-primary);
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin-bottom: var(--space-2);
  }

  .progress-filename {
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    margin-bottom: var(--space-5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .progress-bar {
    width: 100%;
    height: var(--space-4);
    background-color: var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background-color: var(--accent-color);
    transition: width var(--transition-medium);
  }
</style>
