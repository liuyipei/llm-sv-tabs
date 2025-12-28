<script lang="ts">
  import type { TabControls } from '../types';

  export let controls: TabControls;
  export let onChange: (controls: Partial<TabControls>) => void;
  export let onRerun: () => void;
</script>

<section class="panel">
  <header>
    <div>
      <p class="eyebrow">Controls</p>
      <h3>Capability, budget, and heuristics</h3>
    </div>
    <button class="run" on:click={onRerun}>Re-run pipeline</button>
  </header>

  <div class="grid">
    <label>
      <span>Capability path</span>
      <select
        value={controls.capabilityPath}
        on:change={(e) => onChange({ capabilityPath: (e.target as HTMLSelectElement).value as TabControls['capabilityPath'] })}
      >
        <option value="text-only">text-only</option>
        <option value="vision">vision</option>
        <option value="native-doc">native-doc</option>
      </select>
    </label>

    <label>
      <span>Max tokens</span>
      <input
        type="number"
        min="100"
        step="25"
        value={controls.maxTokens}
        on:input={(e) => onChange({ maxTokens: Number((e.target as HTMLInputElement).value) })}
      />
    </label>

    <label>
      <span>Summarize when token estimate exceeds</span>
      <input
        type="number"
        min="120"
        step="40"
        value={controls.summarizeLongerThan}
        on:input={(e) => onChange({ summarizeLongerThan: Number((e.target as HTMLInputElement).value) })}
      />
    </label>
  </div>

  <div class="toggles">
    <label class="checkbox">
      <input
        type="checkbox"
        checked={controls.includeAttachments}
        on:change={(e) => onChange({ includeAttachments: (e.target as HTMLInputElement).checked })}
      />
      <span>Include attachments</span>
    </label>

    <label class="checkbox">
      <input
        type="checkbox"
        checked={controls.noHeuristics}
        on:change={(e) => onChange({ noHeuristics: (e.target as HTMLInputElement).checked })}
      />
      <span>No heuristics (keep ordering, skip boosts)</span>
    </label>
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

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin-top: 10px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    color: #cbd5e1;
  }

  input,
  select {
    background: #111827;
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 8px;
    font-size: 14px;
  }

  .toggles {
    display: flex;
    gap: 16px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  .run {
    background: linear-gradient(135deg, #22d3ee, #6366f1);
    border: none;
    color: #0b1017;
    padding: 8px 12px;
    border-radius: 8px;
    font-weight: 700;
    cursor: pointer;
  }
</style>
