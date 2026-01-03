<script lang="ts">
  import { currentPipeline, log } from '$lib/stores/experiment';
  import type { PipelineStage } from '$lib/types';

  let selectedConversion = $state('pdf-to-image');
  let dpi = $state(150);
  let format = $state<'png' | 'jpeg' | 'webp'>('png');

  const conversions = [
    { id: 'pdf-to-image', label: 'PDF → Images', from: 'capture', to: 'render' },
    { id: 'image-to-text-ocr', label: 'Image → Text (OCR)', from: 'render', to: 'extract' },
    { id: 'image-to-text-vision', label: 'Image → Text (Vision)', from: 'render', to: 'extract' },
    { id: 'webpage-to-pdf', label: 'Webpage → PDF', from: 'capture', to: 'render' },
    { id: 'text-layer', label: 'PDF Text Layer', from: 'capture', to: 'extract' },
  ];

  function handleRunConversion(): void {
    log('info', `Running conversion: ${selectedConversion} (DPI: ${dpi}, Format: ${format})`);
    // TODO: Implement actual conversion
  }
</script>

<div class="conversion-panel">
  <h2 class="section-title">Format Conversion</h2>

  {#if !$currentPipeline}
    <div class="empty-state">
      <p>Select a pipeline to run conversions.</p>
    </div>
  {:else}
    <div class="conversion-form">
      <!-- Conversion Type -->
      <div class="form-group" role="radiogroup" aria-labelledby="conversion-type-label">
        <span id="conversion-type-label" class="form-label">Conversion Type</span>
        <div class="conversion-options">
          {#each conversions as conv}
            <label class="radio-option" class:selected={selectedConversion === conv.id}>
              <input
                type="radio"
                name="conversion"
                value={conv.id}
                bind:group={selectedConversion}
              />
              <span class="radio-label">{conv.label}</span>
            </label>
          {/each}
        </div>
      </div>

      <!-- Options -->
      <div class="options-grid">
        <div class="form-group">
          <label class="form-label" for="dpi-select">DPI (for rasterization)</label>
          <select id="dpi-select" class="select-input" bind:value={dpi}>
            <option value={72}>72 (screen)</option>
            <option value={150}>150 (standard)</option>
            <option value={300}>300 (high quality)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="format-select">Output Format</label>
          <select id="format-select" class="select-input" bind:value={format}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </div>
      </div>

      <!-- Run Button -->
      <button class="run-btn" onclick={handleRunConversion}>
        Run Conversion
      </button>
    </div>

    <!-- Conversion Info -->
    <div class="info-box">
      <h3>About Conversions</h3>
      <ul>
        <li><strong>PDF → Images:</strong> Uses pdf.js to rasterize each page</li>
        <li><strong>OCR:</strong> Uses Tesseract.js for text recognition</li>
        <li><strong>Vision:</strong> Sends to LLM for intelligent extraction</li>
        <li><strong>Text Layer:</strong> Extracts embedded text from PDFs</li>
      </ul>
    </div>
  {/if}
</div>

<style>
  .conversion-panel {
    max-width: 600px;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-6);
  }

  .empty-state {
    padding: var(--space-8);
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    text-align: center;
    color: var(--text-tertiary);
  }

  .conversion-form {
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    margin-bottom: var(--space-6);
  }

  .form-group {
    margin-bottom: var(--space-4);
  }

  .form-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: var(--space-2);
  }

  .conversion-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.15s;
  }

  .radio-option:hover {
    border-color: var(--text-tertiary);
  }

  .radio-option.selected {
    border-color: var(--accent-color);
    background-color: rgba(88, 166, 255, 0.1);
  }

  .radio-option input {
    display: none;
  }

  .radio-label {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }

  .select-input {
    width: 100%;
    padding: var(--space-3);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .run-btn {
    width: 100%;
    padding: var(--space-4);
    background-color: var(--accent-color);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .run-btn:hover {
    background-color: var(--accent-hover);
  }

  .info-box {
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .info-box h3 {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0 0 var(--space-2);
  }

  .info-box ul {
    margin: 0;
    padding-left: var(--space-4);
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .info-box li {
    margin-bottom: var(--space-1);
  }
</style>
