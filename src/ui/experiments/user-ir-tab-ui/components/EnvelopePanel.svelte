<script lang="ts">
  import type { EnvelopePreview } from '../types';

  export let envelope: EnvelopePreview;
  export let warnings: string[] = [];
  export let onExport: () => void;
</script>

<section class="panel">
  <header>
    <div>
      <p class="eyebrow">Preview</p>
      <h3>Context envelope and provider payloads</h3>
    </div>
    <div class="cta">
      <button on:click={onExport}>Export JSON</button>
    </div>
  </header>

  <div class="budget">
    <div>
      <p class="label">Tokens</p>
      <strong>{envelope.budget.used_tokens}/{envelope.budget.max_tokens}</strong>
    </div>
    <div>
      <p class="label">Degrade stage</p>
      <strong class="pill">{envelope.degrade_stage_label}</strong>
    </div>
    <div>
      <p class="label">Capability</p>
      <strong class="pill">{envelope.capability_path}</strong>
    </div>
  </div>

  {#if warnings.length}
    <div class="warning">
      {#each warnings as warning}
        <p>⚠️ {warning}</p>
      {/each}
    </div>
  {/if}

  <div class="grid">
    <div class="card">
      <h4>Chunks ({envelope.chunks.length})</h4>
      <div class="list">
        {#each envelope.chunks as chunk}
          <div class="item">
            <div class="title">{chunk.title}</div>
            <div class="meta">
              <span class="pill">{chunk.source_type}</span>
              <span class="pill">{chunk.token_count} tok</span>
              {#if chunk.relevance_score !== undefined}
                <span class="pill">score {chunk.relevance_score}</span>
              {/if}
            </div>
            <div class="content">{chunk.content}</div>
          </div>
        {/each}
      </div>
    </div>

    <div class="card">
      <h4>Chunk annotations</h4>
      <div class="list">
        {#if !envelope.chunk_annotations.length}
          <p class="empty">No budget actions recorded.</p>
        {:else}
          {#each envelope.chunk_annotations as ann}
            <div class="item">
              <div class="title">{ann.anchor}</div>
              <div class="meta">
                <span class="pill">{ann.stage}</span>
                <span class="pill">{ann.included ? 'included' : 'omitted'}</span>
              </div>
              <p class="content">{ann.reason}</p>
              {#if ann.summary}
                <code>{ann.summary}</code>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h4>Attachments</h4>
      <div class="list">
        {#if !envelope.attachments.length}
          <p class="empty">No attachments found.</p>
        {:else}
          {#each envelope.attachments as att}
            <div class="item">
              <div class="title">{att.anchor}</div>
              <div class="meta">
                <span class="pill">{att.artifact_type}</span>
                <span class="pill">{att.mime_type}</span>
                <span class="pill">{att.included ? 'included' : 'omitted'}</span>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <div class="card">
      <h4>Provider payload previews</h4>
      <div class="list">
        {#each envelope.provider_payloads as payload}
          <div class="item">
            <div class="title">{payload.provider}</div>
            <div class="meta">
              <span class="pill">{payload.capability}</span>
              <span class="pill">{payload.attachments.length} attachments</span>
            </div>
            <pre>{payload.content}</pre>
            {#if payload.warnings?.length}
              <p class="warning">Warnings: {payload.warnings.join('; ')}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .panel {
    border: 1px solid #1f2937;
    background: #0b1017;
    padding: 14px;
    border-radius: 10px;
    color: #e2e8f0;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
    color: #94a3b8;
    margin: 0;
  }

  h3 {
    margin: 4px 0 0;
    font-size: 18px;
  }

  .cta button {
    background: #22d3ee;
    color: #0b1017;
    border: none;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    font-weight: 700;
  }

  .budget {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin: 12px 0;
  }

  .label {
    color: #94a3b8;
    margin: 0;
  }

  .pill {
    padding: 4px 8px;
    border-radius: 10px;
    background: #1e293b;
    color: #cbd5e1;
    font-size: 12px;
    display: inline-block;
  }

  .warning {
    background: rgba(234, 179, 8, 0.08);
    border: 1px solid rgba(234, 179, 8, 0.3);
    padding: 8px 10px;
    border-radius: 8px;
    color: #fbbf24;
    margin-bottom: 10px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
    margin-top: 10px;
  }

  .card {
    border: 1px solid #1f2937;
    border-radius: 10px;
    padding: 10px;
    background: #0f172a;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }

  .item {
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 8px;
  }

  .title {
    font-weight: 700;
  }

  .meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 4px 0;
  }

  .content {
    color: #cbd5e1;
    white-space: pre-wrap;
  }

  pre {
    background: #111827;
    color: #e2f3ff;
    padding: 6px;
    border-radius: 6px;
    overflow: auto;
    max-height: 180px;
  }

  code {
    display: block;
    background: #111827;
    padding: 6px;
    border-radius: 6px;
    color: #e2f3ff;
    margin-top: 4px;
  }

  .empty {
    color: #94a3b8;
  }
</style>
