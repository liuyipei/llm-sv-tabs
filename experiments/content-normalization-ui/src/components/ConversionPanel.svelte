<script lang="ts">
  import { currentPipeline, log, getSourceFile, addArtifact, selectedPipelineId, selectedStage } from '$lib/stores/experiment';
  import { convertPdfToImages, extractPdfText } from '$lib/services/pdf-converter';
  import { createArtifactId, type RenderArtifact, type ExtractArtifact, type Anchor, type SourceId } from '$lib/types';
  import { get } from 'svelte/store';

  let selectedConversion = $state('pdf-to-image');
  let dpi = $state(150);
  let format = $state<'png' | 'jpeg' | 'webp'>('png');
  let isRunning = $state(false);

  // Only conversions that work in browser context
  const conversions = [
    { id: 'pdf-to-image', label: 'PDF → Images', desc: 'Rasterize PDF pages' },
    { id: 'text-layer', label: 'PDF → Text', desc: 'Extract embedded text' },
  ];

  async function handleRunConversion(): Promise<void> {
    const pipeline = get(currentPipeline);
    const sourceId = get(selectedPipelineId);
    if (!pipeline || !sourceId) return log('error', 'No pipeline selected');

    const sourceFile = getSourceFile(sourceId);
    if (!sourceFile || typeof sourceFile === 'string') {
      return log('error', 'PDF file required');
    }

    isRunning = true;
    const anchor = pipeline.source_id as Anchor;

    try {
      if (selectedConversion === 'pdf-to-image') {
        const result = await convertPdfToImages(sourceFile, { dpi, format });
        const artifact: RenderArtifact = {
          artifact_id: createArtifactId(),
          stage: 'render',
          source_anchor: anchor,
          created_at: Date.now(),
          provenance: { method: 'pdf_rasterize', version: '1.0.0', parent_ids: [], config: { dpi, format }, duration_ms: result.duration },
          selected: false,
          render_type: 'rasterized_pages',
          pages: result.pages.map((p) => ({
            page_number: p.pageNumber,
            image: { data: p.imageDataUrl, mime_type: `image/${format}`, byte_size: Math.round(p.imageDataUrl.length * 0.75) },
            dimensions: { width: p.width, height: p.height },
            anchor: `${anchor}#p=${p.pageNumber}` as Anchor,
          })),
          render_config: { dpi, format },
          page_count: result.pageCount,
        };
        addArtifact(sourceId, artifact);
        selectedStage.set('render');
        log('info', `Rendered ${result.pageCount} pages (${result.duration}ms)`);
      } else if (selectedConversion === 'text-layer') {
        const result = await extractPdfText(sourceFile);
        const artifact: ExtractArtifact = {
          artifact_id: createArtifactId(),
          stage: 'extract',
          source_anchor: anchor,
          created_at: Date.now(),
          provenance: { method: 'pdf_text_layer', version: '1.0.0', parent_ids: [], duration_ms: result.duration },
          selected: false,
          extract_type: 'text_layer',
          text: result.text,
          quality: result.text.length > 100 ? 'good' : 'low',
          token_estimate: Math.ceil(result.text.length / 4),
          char_count: result.text.length,
          page_texts: result.pages.map((text, i) => ({
            page_number: i + 1, text, quality: text.length > 50 ? 'good' as const : 'low' as const,
            anchor: `${anchor}#p=${i + 1}` as Anchor, char_count: text.length,
          })),
        };
        addArtifact(sourceId, artifact);
        selectedStage.set('extract');
        log('info', `Extracted ${result.text.length} chars (${result.duration}ms)`);
      }
    } catch (e) {
      log('error', `Failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      isRunning = false;
    }
  }
</script>

<div class="panel">
  {#if !$currentPipeline}
    <p class="empty">Select a pipeline to run conversions.</p>
  {:else if $currentPipeline.source_info.type !== 'pdf'}
    <p class="empty">Select a PDF pipeline for conversions.</p>
  {:else}
    <div class="form">
      <div class="options">
        {#each conversions as conv}
          <label class="option" class:selected={selectedConversion === conv.id}>
            <input type="radio" name="conv" value={conv.id} bind:group={selectedConversion} />
            <span><strong>{conv.label}</strong><br/><small>{conv.desc}</small></span>
          </label>
        {/each}
      </div>

      {#if selectedConversion === 'pdf-to-image'}
        <div class="settings">
          <label>DPI <select bind:value={dpi}>
            <option value={72}>72</option>
            <option value={150}>150</option>
            <option value={300}>300</option>
          </select></label>
          <label>Format <select bind:value={format}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select></label>
        </div>
      {/if}

      <button onclick={handleRunConversion} disabled={isRunning}>
        {isRunning ? 'Converting...' : 'Run Conversion'}
      </button>
    </div>
  {/if}
</div>

<style>
  .panel { max-width: 500px; }
  .empty { padding: 2rem; background: var(--bg-secondary); border-radius: 8px; text-align: center; color: var(--text-tertiary); }
  .form { background: var(--bg-secondary); border-radius: 8px; padding: 1rem; }
  .options { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
  .option { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; }
  .option:hover { border-color: var(--text-tertiary); }
  .option.selected { border-color: var(--accent-color); background: rgba(88,166,255,0.1); }
  .option input { display: none; }
  .option small { color: var(--text-tertiary); }
  .settings { display: flex; gap: 1rem; margin-bottom: 1rem; }
  .settings label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
  .settings select { padding: 0.25rem 0.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); }
  button { width: 100%; padding: 0.75rem; background: var(--accent-color); border: none; border-radius: 6px; color: white; font-weight: 500; cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-hover); }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
