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
    bottom: 20px;
    right: 20px;
    background-color: #252526;
    border: 1px solid #007acc;
    border-radius: 6px;
    padding: 15px 20px;
    min-width: 300px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }

  .progress-text {
    color: #cccccc;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 5px;
  }

  .progress-filename {
    color: #808080;
    font-size: 12px;
    margin-bottom: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background-color: #3e3e42;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background-color: #007acc;
    transition: width 0.3s ease;
  }
</style>
