<script lang="ts">
  import {
    activeTab,
    pipelines,
    pipelineIds,
    selectedPipelineId,
    currentPipeline,
    logMessages,
    clearAllPipelines,
    log,
  } from '$lib/stores/experiment';
  import { loadSamplePipelines } from '$lib/mock-data';
  import type { ExperimentTab } from '$lib/types';

  import SourceUploader from '$components/SourceUploader.svelte';
  import PipelineView from '$components/PipelineView.svelte';
  import ConversionPanel from '$components/ConversionPanel.svelte';
  import LLMExtractPanel from '$components/LLMExtractPanel.svelte';
  import ContextPreview from '$components/ContextPreview.svelte';

  const tabs: { id: ExperimentTab; label: string; icon: string }[] = [
    { id: 'upload', label: 'Upload', icon: '📤' },
    { id: 'pipeline', label: 'Pipeline', icon: '🔄' },
    { id: 'convert', label: 'Convert', icon: '🔀' },
    { id: 'llm', label: 'LLM Extract', icon: '🤖' },
    { id: 'preview', label: 'Preview', icon: '👁️' },
  ];

  function handleLoadSamples(): void {
    const samples = loadSamplePipelines();
    pipelines.set(samples);
    if (samples.size > 0) {
      selectedPipelineId.set(Array.from(samples.keys())[0]);
      activeTab.set('pipeline');
    }
    log('info', `Loaded ${samples.size} sample pipelines`);
  }

  function handleClearAll(): void {
    if (confirm('Clear all pipelines?')) {
      clearAllPipelines();
    }
  }
</script>

<div class="app">
  <!-- Header -->
  <header class="app-header">
    <div class="header-left">
      <h1 class="app-title">Content Normalization Experiment</h1>
      <span class="version-badge">v0.1.0</span>
    </div>
    <div class="header-actions">
      <button class="action-btn" onclick={handleLoadSamples}>
        Load Samples
      </button>
      <button class="action-btn danger" onclick={handleClearAll}>
        Clear All
      </button>
    </div>
  </header>

  <!-- Main Content -->
  <div class="app-content">
    <!-- Sidebar -->
    <aside class="sidebar">
      <!-- Tab Navigation -->
      <nav class="tab-nav">
        {#each tabs as tab}
          <button
            class="tab-btn"
            class:active={$activeTab === tab.id}
            onclick={() => activeTab.set(tab.id)}
          >
            <span class="tab-icon">{tab.icon}</span>
            <span class="tab-label">{tab.label}</span>
          </button>
        {/each}
      </nav>

      <!-- Pipeline List -->
      <div class="pipeline-list">
        <h3 class="section-title">Pipelines ({$pipelineIds.length})</h3>
        {#if $pipelineIds.length === 0}
          <p class="empty-message">No pipelines yet. Upload a source or load samples.</p>
        {:else}
          <ul class="pipeline-items">
            {#each $pipelineIds as id}
              {@const pipeline = $pipelines.get(id)}
              {#if pipeline}
                <li>
                  <button
                    class="pipeline-item"
                    class:selected={$selectedPipelineId === id}
                    onclick={() => {
                      selectedPipelineId.set(id);
                      activeTab.set('pipeline');
                    }}
                  >
                    <span class="pipeline-icon">
                      {pipeline.source_info.type === 'pdf' ? '📄' :
                       pipeline.source_info.type === 'webpage' ? '🌐' :
                       pipeline.source_info.type === 'image' ? '🖼️' : '📝'}
                    </span>
                    <span class="pipeline-name">{pipeline.source_info.title}</span>
                    <span class="pipeline-status">
                      {#if pipeline.status.state === 'complete'}
                        ✓
                      {:else if pipeline.status.state === 'running'}
                        ⏳
                      {:else if pipeline.status.state === 'error'}
                        ⚠️
                      {/if}
                    </span>
                  </button>
                </li>
              {/if}
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Log Panel -->
      <div class="log-panel">
        <h3 class="section-title">Log</h3>
        <div class="log-messages">
          {#each $logMessages.slice(-10) as msg}
            <div class="log-entry {msg.level}">
              <span class="log-time">{msg.time.toLocaleTimeString()}</span>
              <span class="log-text">{msg.message}</span>
            </div>
          {/each}
        </div>
      </div>
    </aside>

    <!-- Main Panel -->
    <main class="main-panel">
      {#if $activeTab === 'upload'}
        <SourceUploader />
      {:else if $activeTab === 'pipeline'}
        <PipelineView />
      {:else if $activeTab === 'convert'}
        <ConversionPanel />
      {:else if $activeTab === 'llm'}
        <LLMExtractPanel />
      {:else if $activeTab === 'preview'}
        <ContextPreview />
      {/if}
    </main>
  </div>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: var(--bg-primary);
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4) var(--space-6);
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .app-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .version-badge {
    padding: 2px 8px;
    background-color: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
  }

  .action-btn {
    padding: var(--space-2) var(--space-4);
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background-color: var(--accent-color);
    border-color: var(--accent-color);
    color: white;
  }

  .action-btn.danger:hover {
    background-color: var(--error-color);
    border-color: var(--error-color);
  }

  .app-content {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .sidebar {
    width: 280px;
    background-color: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
  }

  .tab-nav {
    display: flex;
    flex-direction: column;
    padding: var(--space-2);
    border-bottom: 1px solid var(--border-color);
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .tab-btn:hover {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .tab-btn.active {
    background-color: var(--accent-color);
    color: white;
  }

  .tab-icon {
    font-size: 1rem;
  }

  .pipeline-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3);
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 var(--space-2);
  }

  .empty-message {
    font-size: 0.875rem;
    color: var(--text-tertiary);
    padding: var(--space-2);
  }

  .pipeline-items {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .pipeline-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .pipeline-item:hover {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .pipeline-item.selected {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    border-left: 2px solid var(--accent-color);
  }

  .pipeline-icon {
    font-size: 1rem;
  }

  .pipeline-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pipeline-status {
    font-size: 0.75rem;
  }

  .log-panel {
    border-top: 1px solid var(--border-color);
    padding: var(--space-3);
    max-height: 150px;
    overflow-y: auto;
  }

  .log-messages {
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .log-entry {
    display: flex;
    gap: var(--space-2);
    padding: 2px 0;
    color: var(--text-tertiary);
  }

  .log-entry.warn {
    color: var(--warning-color);
  }

  .log-entry.error {
    color: var(--error-color);
  }

  .log-time {
    opacity: 0.6;
  }

  .main-panel {
    flex: 1;
    overflow: auto;
    padding: var(--space-6);
  }
</style>
