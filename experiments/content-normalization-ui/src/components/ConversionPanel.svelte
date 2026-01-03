<script lang="ts">
  import { currentPipeline, log, getSourceFile, addArtifact, selectedPipelineId, selectedStage } from '$lib/stores/experiment';
  import { convertPdfToImages, extractPdfText } from '$lib/services/pdf-converter';
  import { createArtifactId, type RenderArtifact, type ExtractArtifact, type Anchor, type SourceId } from '$lib/types';
  import { get } from 'svelte/store';

  let selectedConversion = $state('pdf-to-image');
  let dpi = $state(150);
  let format = $state<'png' | 'jpeg' | 'webp'>('png');
  let isRunning = $state(false);

  const conversions = [
    { id: 'pdf-to-image', label: 'PDF → Images', from: 'capture', to: 'render' },
    { id: 'image-to-text-ocr', label: 'Image → Text (OCR)', from: 'render', to: 'extract' },
    { id: 'image-to-text-vision', label: 'Image → Text (Vision)', from: 'render', to: 'extract' },
    { id: 'webpage-to-pdf', label: 'Webpage → PDF', from: 'capture', to: 'render' },
    { id: 'text-layer', label: 'PDF Text Layer', from: 'capture', to: 'extract' },
  ];

  async function handleRunConversion(): Promise<void> {
    const pipeline = get(currentPipeline);
    const sourceId = get(selectedPipelineId);
    if (!pipeline || !sourceId) {
      log('error', 'No pipeline selected');
      return;
    }

    const sourceFile = getSourceFile(sourceId);
    if (!sourceFile) {
      log('error', 'No source file found for pipeline');
      return;
    }

    isRunning = true;
    log('info', `Running conversion: ${selectedConversion} (DPI: ${dpi}, Format: ${format})`);

    try {
      if (selectedConversion === 'pdf-to-image') {
        await runPdfToImage(sourceId, sourceFile, pipeline.source_id as Anchor);
      } else if (selectedConversion === 'text-layer') {
        await runTextLayerExtraction(sourceId, sourceFile, pipeline.source_id as Anchor);
      } else {
        log('warn', `Conversion "${selectedConversion}" not yet implemented`);
      }
    } catch (error) {
      log('error', `Conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      isRunning = false;
    }
  }

  async function runPdfToImage(sourceId: SourceId, sourceFile: File | ArrayBuffer | string, anchor: Anchor): Promise<void> {
    if (!(sourceFile instanceof File) && !(sourceFile instanceof ArrayBuffer)) {
      log('error', 'PDF to image requires a File or ArrayBuffer');
      return;
    }

    const result = await convertPdfToImages(sourceFile, { dpi, format });
    log('info', `Converted ${result.pageCount} pages in ${result.duration}ms`);

    // Create a render artifact for the converted pages
    const artifact: RenderArtifact = {
      artifact_id: createArtifactId(),
      stage: 'render',
      source_anchor: anchor,
      created_at: Date.now(),
      provenance: {
        method: 'pdf_rasterize',
        version: '1.0.0',
        parent_ids: [],
        config: { dpi, format },
        duration_ms: result.duration,
      },
      selected: false,
      render_type: 'rasterized_pages',
      pages: result.pages.map((page) => ({
        page_number: page.pageNumber,
        image: {
          data: page.imageDataUrl,
          mime_type: `image/${format}`,
          byte_size: Math.round(page.imageDataUrl.length * 0.75), // Approximate
        },
        dimensions: { width: page.width, height: page.height },
        anchor: `${anchor}#p=${page.pageNumber}` as Anchor,
      })),
      render_config: { dpi, format },
      page_count: result.pageCount,
    };

    addArtifact(sourceId, artifact);
    selectedStage.set('render');
    log('info', `Created render artifact with ${result.pageCount} pages`);
  }

  async function runTextLayerExtraction(sourceId: SourceId, sourceFile: File | ArrayBuffer | string, anchor: Anchor): Promise<void> {
    if (!(sourceFile instanceof File) && !(sourceFile instanceof ArrayBuffer)) {
      log('error', 'Text layer extraction requires a File or ArrayBuffer');
      return;
    }

    const result = await extractPdfText(sourceFile);
    log('info', `Extracted text from ${result.pages.length} pages in ${result.duration}ms`);

    // Create an extract artifact
    const artifact: ExtractArtifact = {
      artifact_id: createArtifactId(),
      stage: 'extract',
      source_anchor: anchor,
      created_at: Date.now(),
      provenance: {
        method: 'pdf_text_layer',
        version: '1.0.0',
        parent_ids: [],
        duration_ms: result.duration,
      },
      selected: false,
      extract_type: 'text_layer',
      text: result.text,
      quality: result.text.length > 100 ? 'good' : 'low',
      token_estimate: Math.ceil(result.text.length / 4),
      char_count: result.text.length,
      page_texts: result.pages.map((text, i) => ({
        page_number: i + 1,
        text,
        quality: text.length > 50 ? 'good' as const : 'low' as const,
        anchor: `${anchor}#p=${i + 1}` as Anchor,
        char_count: text.length,
      })),
    };

    addArtifact(sourceId, artifact);
    selectedStage.set('extract');
    log('info', `Created extract artifact with ${result.text.length} characters`);
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
      <button class="run-btn" onclick={handleRunConversion} disabled={isRunning}>
        {isRunning ? 'Converting...' : 'Run Conversion'}
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
