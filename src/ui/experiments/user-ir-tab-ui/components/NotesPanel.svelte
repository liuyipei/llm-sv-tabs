<script lang="ts">
  import type { CustomNote } from '../types';

  export let notes: CustomNote[] = [];
</script>

<section class="panel">
  <header>
    <div>
      <p class="eyebrow">Custom notes</p>
      <h3>Branch-to-note outputs</h3>
    </div>
  </header>

  {#if !notes.length}
    <p class="empty">Create notes from any step to pin intermediate thinking.</p>
  {:else}
    <div class="notes">
      {#each notes as note}
        <article class="note">
          <div class="row">
            <h4>{note.title}</h4>
            <span class="pill">tab: {note.tab_id}</span>
          </div>
          <p class="meta">from step {note.from_step}</p>
          <pre>{note.content}</pre>
        </article>
      {/each}
    </div>
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

  .notes {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .note {
    border: 1px solid #1f2937;
    border-radius: 10px;
    padding: 10px;
    background: #0f172a;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .pill {
    padding: 4px 8px;
    border-radius: 10px;
    background: #1e293b;
    color: #cbd5e1;
    font-size: 12px;
  }

  .meta {
    color: #cbd5e1;
    margin: 4px 0;
  }

  pre {
    background: #111827;
    color: #e2f3ff;
    padding: 8px;
    border-radius: 8px;
    white-space: pre-wrap;
  }

  .empty {
    color: #94a3b8;
  }
</style>
