<script lang="ts">
  import type { EncodingStep } from '../types';

  export let steps: EncodingStep[] = [];
  export let onBranch: (stepId: string) => void;
  export let onNote: (stepId: string) => void;
</script>

<section class="panel">
  <header>
    <div>
      <p class="eyebrow">Encoding steps</p>
      <h3>Every decision, chronologically</h3>
    </div>
    <div class="legend">
      <span class="pill">normalize</span>
      <span class="pill">rank</span>
      <span class="pill">budget</span>
      <span class="pill">payload-build</span>
    </div>
  </header>

  <div class="steps">
    {#if !steps.length}
      <div class="empty">Run the pipeline to view steps.</div>
    {:else}
      {#each steps as step}
        <div class={`step ${step.stage}`}>
          <div class="row">
            <div class="id">
              <span class="pill small">{step.stage}</span>
              <strong>{step.step_id}</strong>
            </div>
            <div class="numbers">
              <span>{step.token_estimate} tok</span>
              <span>{step.capability_path}</span>
            </div>
          </div>
          <p class="reason">{step.reason}</p>
          {#if step.degrade_stage}
            <p class="degrade">degrade: {step.degrade_stage}</p>
          {/if}
          <div class="meta">
            <div>
              <span class="label">Inputs</span>
              <code>{step.input_refs.join(', ')}</code>
            </div>
            <div>
              <span class="label">Outputs</span>
              <code>{step.output_refs.join(', ')}</code>
            </div>
          </div>
          <div class="actions">
            <button on:click={() => onBranch(step.step_id)}>Branch to tab</button>
            <button on:click={() => onNote(step.step_id)}>Create note</button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .panel {
    border: 1px solid #1f2937;
    background: #0b1017;
    padding: 14px;
    border-radius: 10px;
    color: #e2e8f0;
    height: 100%;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
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

  .legend {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .step {
    border: 1px solid #1f2937;
    background: #0f172a;
    padding: 10px;
    border-radius: 10px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .id {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .numbers {
    display: flex;
    gap: 10px;
    color: #cbd5e1;
    font-size: 13px;
  }

  .reason {
    margin: 6px 0;
    color: #e2e8f0;
  }

  .degrade {
    margin: 4px 0;
    color: #fbbf24;
    font-weight: 600;
  }

  .meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px;
    font-size: 13px;
  }

  code {
    background: #111827;
    padding: 4px 6px;
    border-radius: 6px;
    display: inline-block;
    color: #e2f3ff;
    word-break: break-word;
  }

  .label {
    color: #94a3b8;
    display: block;
    margin-bottom: 2px;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  button {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2f3ff;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
  }

  button:hover {
    border-color: #38bdf8;
  }

  .pill {
    padding: 4px 8px;
    border-radius: 12px;
    background: #1e293b;
    color: #cbd5e1;
    font-size: 12px;
  }

  .pill.small {
    font-size: 11px;
    padding: 3px 6px;
  }

  .empty {
    color: #cbd5e1;
  }
</style>
