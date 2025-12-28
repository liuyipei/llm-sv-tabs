<script lang="ts">
  import ControlsPanel from './components/ControlsPanel.svelte';
  import EnvelopePanel from './components/EnvelopePanel.svelte';
  import LogsPanel from './components/LogsPanel.svelte';
  import NotesPanel from './components/NotesPanel.svelte';
  import StepsPanel from './components/StepsPanel.svelte';
  import TabsList from './components/TabsList.svelte';
  import { buildFixtureTabs } from './fixtures/mock-fixtures';
  import { branchTab, createNoteFromStep, initializeTabs, rerunTab } from './state';
  import type { CustomNote, ExperimentTab, TabControls } from './types';

  const fixtureTabs = buildFixtureTabs();
  let tabs: ExperimentTab[] = initializeTabs(fixtureTabs);
  let activeTabId: string | null = tabs[0]?.tab_id ?? null;
  let notes: CustomNote[] = [];

  $: activeTab = tabs.find((t) => t.tab_id === activeTabId);

  const selectTab = (id: string) => {
    activeTabId = id;
  };

  const updateControls = (partial: Partial<TabControls>) => {
    if (!activeTab) return;
    tabs = tabs.map((tab) =>
      tab.tab_id === activeTab.tab_id ? { ...tab, controls: { ...tab.controls, ...partial } } : tab,
    );
  };

  const rerun = () => {
    if (!activeTab) return;
    const updated = rerunTab(activeTab);
    tabs = tabs.map((t) => (t.tab_id === activeTab.tab_id ? updated : t));
  };

  const branchFromStep = (stepId: string) => {
    if (!activeTab) return;
    const newTab = branchTab(activeTab, stepId);
    tabs = [...tabs, newTab];
    activeTabId = newTab.tab_id;
  };

  const noteFromStep = (stepId: string) => {
    if (!activeTab) return;
    notes = [createNoteFromStep(activeTab, stepId), ...notes];
  };

  const downloadJson = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportEnvelope = () => {
    if (!activeTab) return;
    downloadJson(activeTab.lastRun.envelope, `${activeTab.tab_id}-envelope.json`);
  };

  const exportLogs = () => {
    if (!activeTab) return;
    downloadJson(activeTab.lastRun.logs, `${activeTab.tab_id}-logs.json`);
  };
</script>

<div class="experiment-shell">
  <aside>
    <div class="intro">
      <p class="eyebrow">Phase 3 sandbox</p>
      <h2>Tab-first IR transparency</h2>
      <p class="lede">
        This in-repo experiment exposes every decision: normalization, ranking, budgeting, capability routing,
        and provider payload shaping. Branch any step into a tab or generate a custom note from the ledger.
      </p>
    </div>
    <TabsList {tabs} {activeTabId} onSelect={selectTab} />
  </aside>

  {#if activeTab}
    <main>
      <div class="top">
        <div>
          <p class="eyebrow">Scenario</p>
          <h2>{activeTab.title}</h2>
          <p class="lede">{activeTab.scenario}</p>
        </div>
        <div class="task">
          <p class="label">Task</p>
          <p>{activeTab.task}</p>
        </div>
      </div>

      <ControlsPanel controls={activeTab.controls} onChange={updateControls} onRerun={rerun} />

      <div class="grid two">
        <StepsPanel steps={activeTab.lastRun.steps} onBranch={branchFromStep} onNote={noteFromStep} />
        <EnvelopePanel
          envelope={activeTab.lastRun.envelope}
          warnings={activeTab.lastRun.warnings}
          onExport={exportEnvelope}
        />
      </div>

      <div class="grid two">
        <LogsPanel logs={activeTab.lastRun.logs} onExport={exportLogs} />
        <NotesPanel {notes} />
      </div>
    </main>
  {:else}
    <main>
      <p class="empty">Select a tab to view the pipeline.</p>
    </main>
  {/if}
</div>

<style>
  :global(body) {
    background: #0b1017;
  }

  .experiment-shell {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 14px;
    padding: 14px;
    color: #e2e8f0;
  }

  aside {
    border: 1px solid #1f2937;
    border-radius: 12px;
    padding: 12px;
    background: #0f172a;
    height: calc(100vh - 28px);
    overflow-y: auto;
  }

  main {
    border: 1px solid #1f2937;
    border-radius: 12px;
    padding: 12px;
    background: #0f172a;
    height: calc(100vh - 28px);
    overflow-y: auto;
  }

  .intro h2 {
    margin: 6px 0;
  }

  .lede {
    color: #cbd5e1;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
    color: #94a3b8;
    margin: 0;
  }

  .top {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-start;
  }

  .task {
    border-left: 1px solid #1f2937;
    padding-left: 12px;
    max-width: 320px;
  }

  .label {
    color: #94a3b8;
    margin: 0;
  }

  .grid.two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 12px;
    margin-top: 12px;
  }

  .empty {
    color: #94a3b8;
  }
</style>
