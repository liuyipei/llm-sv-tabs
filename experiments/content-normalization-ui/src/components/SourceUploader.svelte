<script lang="ts">
  import { createPipelineFromInput, log } from '$lib/stores/experiment';
  import type { SourceInput } from '$lib/types';

  let dragOver = $state(false);
  let urlInput = $state('');
  let textInput = $state('');

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    dragOver = false;

    const files = event.dataTransfer?.files;
    if (files) {
      handleFiles(files);
    }
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(): void {
    dragOver = false;
  }

  function handleFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      handleFiles(input.files);
    }
  }

  function handleFiles(files: FileList): void {
    for (const file of files) {
      const type = file.type.includes('pdf') ? 'pdf' as const :
                   file.type.includes('image') ? 'image' as const : 'text' as const;

      const input: SourceInput = {
        type,
        name: file.name,
        data: file,
      };

      createPipelineFromInput(input);
    }
  }

  function handleUrlSubmit(): void {
    if (!urlInput.trim()) return;

    const input: SourceInput = {
      type: 'url',
      name: new URL(urlInput).hostname,
      data: urlInput,
      url: urlInput,
    };

    createPipelineFromInput(input);
    urlInput = '';
  }

  function handleTextSubmit(): void {
    if (!textInput.trim()) return;

    const input: SourceInput = {
      type: 'text',
      name: `Note ${new Date().toLocaleTimeString()}`,
      data: textInput,
    };

    createPipelineFromInput(input);
    textInput = '';
  }
</script>

<div class="uploader">
  <h2 class="section-title">Add Source</h2>

  <!-- Drop Zone -->
  <div
    class="drop-zone"
    class:drag-over={dragOver}
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    role="button"
    tabindex="0"
  >
    <div class="drop-content">
      <span class="drop-icon">📁</span>
      <p class="drop-text">Drop PDF or image files here</p>
      <p class="drop-hint">or click to browse</p>
    </div>
    <input
      type="file"
      class="file-input"
      accept=".pdf,image/*"
      multiple
      onchange={handleFileInput}
    />
  </div>

  <!-- URL Input -->
  <div class="input-section">
    <h3 class="input-label">Webpage URL</h3>
    <div class="input-row">
      <input
        type="url"
        class="text-input"
        placeholder="https://example.com/article"
        bind:value={urlInput}
        onkeydown={(e) => e.key === 'Enter' && handleUrlSubmit()}
      />
      <button class="submit-btn" onclick={handleUrlSubmit} disabled={!urlInput.trim()}>
        Add
      </button>
    </div>
    <p class="input-hint">Note: URL fetching requires CORS support or a proxy</p>
  </div>

  <!-- Text Input -->
  <div class="input-section">
    <h3 class="input-label">Paste Text</h3>
    <textarea
      class="textarea-input"
      placeholder="Paste text or markdown content..."
      bind:value={textInput}
      rows="5"
    ></textarea>
    <button class="submit-btn" onclick={handleTextSubmit} disabled={!textInput.trim()}>
      Add as Note
    </button>
  </div>

  <!-- Supported Formats -->
  <div class="formats-info">
    <h3 class="input-label">Supported Formats</h3>
    <ul class="format-list">
      <li><span class="format-icon">📄</span> PDF documents</li>
      <li><span class="format-icon">🖼️</span> PNG, JPEG, WebP images</li>
      <li><span class="format-icon">🌐</span> Webpage URLs</li>
      <li><span class="format-icon">📝</span> Text / Markdown</li>
    </ul>
  </div>
</div>

<style>
  .uploader {
    max-width: 600px;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-6);
  }

  .drop-zone {
    position: relative;
    border: 2px dashed var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--space-8);
    text-align: center;
    transition: all 0.2s;
    cursor: pointer;
    margin-bottom: var(--space-6);
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: var(--accent-color);
    background-color: rgba(88, 166, 255, 0.1);
  }

  .drop-content {
    pointer-events: none;
  }

  .drop-icon {
    font-size: 3rem;
    display: block;
    margin-bottom: var(--space-3);
  }

  .drop-text {
    font-size: 1rem;
    color: var(--text-primary);
    margin: 0 0 var(--space-1);
  }

  .drop-hint {
    font-size: 0.875rem;
    color: var(--text-tertiary);
    margin: 0;
  }

  .file-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .input-section {
    margin-bottom: var(--space-6);
  }

  .input-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0 0 var(--space-2);
  }

  .input-row {
    display: flex;
    gap: var(--space-2);
  }

  .text-input {
    flex: 1;
    padding: var(--space-3);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .textarea-input {
    width: 100%;
    padding: var(--space-3);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: var(--font-mono);
    resize: vertical;
    margin-bottom: var(--space-2);
  }

  .textarea-input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .submit-btn {
    padding: var(--space-3) var(--space-4);
    background-color: var(--accent-color);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .submit-btn:hover:not(:disabled) {
    background-color: var(--accent-hover);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin: var(--space-1) 0 0;
  }

  .formats-info {
    padding: var(--space-4);
    background-color: var(--bg-secondary);
    border-radius: var(--radius-md);
  }

  .format-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2);
  }

  .format-list li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .format-icon {
    font-size: 1rem;
  }
</style>
