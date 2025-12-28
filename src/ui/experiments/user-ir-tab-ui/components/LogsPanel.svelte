<script lang="ts">
  import type { LogEntry } from '../types';

  export let logs: LogEntry[] = [];
  export let onExport: () => void;
</script>

<section class="panel">
  <header>
    <div>
      <p class="eyebrow">Logs</p>
      <h3>Structured ledger</h3>
    </div>
    <button class="export" on:click={onExport}>Download JSON</button>
  </header>

  {#if !logs.length}
    <p class="empty">Run a pipeline to view logs.</p>
  {:else}
    <ul>
      {#each logs as log}
        <li class={log.level}>
          <div class="row">
            <span class="pill">{log.level}</span>
            <strong>{log.step_id}</strong>
          </div>
          <p>{log.message}</p>
          {#if log.detail}
            <pre>{JSON.stringify(log.detail, null, 2)}</pre>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
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

  ul {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  li {
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 8px;
    background: #0f172a;
  }

  li.warn {
    border-color: rgba(234, 179, 8, 0.4);
  }

  .row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  p {
    margin: 4px 0;
  }

  .export {
    background: #22d3ee;
    color: #0b1017;
    border: none;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    font-weight: 700;
  }

  .pill {
    padding: 4px 8px;
    border-radius: 10px;
    background: #1e293b;
    color: #cbd5e1;
    font-size: 12px;
  }

  pre {
    background: #111827;
    color: #e2f3ff;
    padding: 6px;
    border-radius: 6px;
    overflow: auto;
    max-height: 140px;
  }

  .empty {
    color: #94a3b8;
  }
</style>
