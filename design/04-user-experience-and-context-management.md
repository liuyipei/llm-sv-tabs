# User Experience and Prompt Context Management

## Overview

The most unique aspect of this browser is its seamless integration of web browsing with LLM interaction. Users can naturally accumulate context through browsing, select relevant content, and query LLMs—all within a unified interface. This document describes the UX patterns and prompt context management system.

## Core UX Philosophy

### Natural Tab Creation

**Traditional browsers**: Tab = one webpage
**This browser**: Tab = any information source (webpage, document, LLM response)

This creates a **unified information workspace** where all content types are first-class citizens.

### Context-Aware Queries

Instead of manually copying/pasting context into LLM chat interfaces, users:
1. Browse and accumulate relevant tabs
2. Select tabs to include as context
3. Ask questions with automatic context injection
4. Receive responses as new tabs (that can themselves become context!)

This creates a **knowledge graph of interactions** rather than linear conversations.

## User Journey

### 1. Browsing Phase

User opens multiple tabs naturally:

```
Tab 1: https://docs.python.org/3/library/asyncio.html
Tab 2: https://stackoverflow.com/questions/...
Tab 3: Uploaded file: database_schema.sql
Tab 4: LLM response: "Explain asyncio basics"
```

**Key UX**: All tabs are equal in the tab list, regardless of source.

### 2. Context Selection

User selects relevant tabs via checkboxes:

```
☑ Tab 1: Python asyncio docs
☑ Tab 3: database_schema.sql
☐ Tab 2: Stack Overflow
☐ Tab 4: LLM response
```

**Visual Feedback**:
- Selected tabs highlighted with accent color
- Selection count shown: "2 tabs selected"
- Selected tabs appear as chips in chat panel

```svelte
<div class="selected-tabs-chips">
  {#each Array.from($selectedTabs) as tabId}
    <div class="chip">
      {getTabTitle(tabId)}
      <button on:click={() => deselectTab(tabId)}>×</button>
    </div>
  {/each}
</div>
```

### 3. Query Formulation

User types query in chat panel:

```
Query: "How do I use asyncio with PostgreSQL connections based on this schema?"

Context:
- Tab 1: Python asyncio docs
- Tab 3: database_schema.sql
```

**UX Features**:
- Multi-line textarea (not single-line input)
- Auto-resize as user types
- Keyboard shortcut: `Ctrl+Enter` to send
- Quick prompt templates: "Summarize", "Explain", "Compare"

```svelte
<textarea
  bind:value={query}
  on:keydown={handleKeyDown}
  placeholder="Ask a question about selected tabs..."
  rows={3}
/>

<div class="quick-prompts">
  <button on:click={() => query = "Summarize the key points from these tabs"}>
    Summarize
  </button>
  <button on:click={() => query = "Explain the concepts in these tabs"}>
    Explain
  </button>
  <button on:click={() => query = "Compare and contrast these tabs"}>
    Compare
  </button>
</div>
```

### 4. Response Streaming

LLM response appears in a new tab **immediately**:

```
New tab created: "Loading..."
↓ (streaming starts)
Tab title updates: "How do I use asyncio..."
↓ (response streams in)
Response appears word-by-word with smooth rendering
↓ (streaming completes)
Tab metadata updated: tokensIn, tokensOut, model
```

**UX Features**:
- **Instant feedback**: Tab created before response starts
- **Live streaming**: Text appears as it's generated
- **Smooth rendering**: Stable/unstable buffer prevents layout thrashing
- **Auto-scroll**: Follows streaming if user is at bottom
- **Manual control**: User can scroll up to read earlier parts

```typescript
// Streaming indicator
{#if isStreaming}
  <div class="streaming-indicator">
    <span class="pulse"></span>
    Generating response...
  </div>
{/if}

// Auto-scroll logic
$: if (isStreaming && isNearBottom) {
  scrollToBottom();
}
```

### 5. Response as Context

The LLM response is now a tab that can be:
- **Selected for future queries**: Creating a conversation thread
- **Bookmarked**: For later reference
- **Inspected**: View full query, context, token counts

**Example Flow**:
```
User: [Selects asyncio docs] "Explain event loops"
→ LLM Response Tab: "An event loop is..."

User: [Selects previous response] "Now show me an example"
→ LLM Response Tab: "Here's an example based on the event loop explanation..."
```

This creates a **threaded conversation** where each response builds on previous context.

## Prompt Context Management

### Context Extraction Pipeline

When user sends a query with selected tabs:

```
Selected Tabs
    ↓
Content Extractor (per tab)
    ↓
DOM Parsing / File Reading
    ↓
Text Extraction
    ↓
Formatting
    ↓
Concatenation
    ↓
Full Query = Context + User Query
```

### Content Extractor

**For Webpages**:
```typescript
async function extractFromWebpage(tabId: string): Promise<ExtractedContent> {
  const view = tabManager.getTabView(tabId);

  // Execute script in webpage context
  const result = await view.webContents.executeJavaScript(`
    (() => {
      // Find main content
      const main = document.querySelector('main, article, [role="main"]')
                   || document.body;

      // Extract headings
      const headings = Array.from(main.querySelectorAll('h1, h2, h3'))
        .map(h => h.textContent.trim());

      // Extract paragraphs
      const paragraphs = Array.from(main.querySelectorAll('p'))
        .map(p => p.textContent.trim())
        .filter(text => text.length > 20);

      // Extract links
      const links = Array.from(main.querySelectorAll('a[href]'))
        .map(a => ({ text: a.textContent.trim(), href: a.href }));

      // Get meta description
      const description = document.querySelector('meta[name="description"]')
        ?.getAttribute('content');

      return {
        title: document.title,
        url: location.href,
        description: description,
        headings: headings,
        paragraphs: paragraphs,
        links: links,
      };
    })()
  `);

  // Format as markdown
  let markdown = `# ${result.title}\n\n`;
  markdown += `URL: ${result.url}\n\n`;

  if (result.description) {
    markdown += `${result.description}\n\n`;
  }

  for (const heading of result.headings) {
    markdown += `## ${heading}\n\n`;
  }

  markdown += result.paragraphs.join('\n\n');

  // Truncate if too long
  if (markdown.length > 50000) {
    markdown = markdown.substring(0, 50000) + '\n\n[Content truncated...]';
  }

  return {
    title: result.title,
    url: result.url,
    content: markdown,
  };
}
```

**For PDF Files**:
```typescript
async function extractFromPdf(tabId: string): Promise<ExtractedContent> {
  const tab = tabManager.getTab(tabId);
  const filePath = tab.url.replace('file://', '');

  // Use pdf-parse library
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);

  return {
    title: tab.title,
    url: tab.url,
    content: pdfData.text,
  };
}
```

**For Uploaded Files**:
```typescript
async function extractFromUpload(tabId: string): Promise<ExtractedContent> {
  const tab = tabManager.getTab(tabId);
  const filePath = tab.metadata.filePath;

  const content = fs.readFileSync(filePath, 'utf-8');

  return {
    title: tab.title,
    url: tab.url,
    content: content,
  };
}
```

**For LLM Responses**:
```typescript
async function extractFromLLMResponse(tabId: string): Promise<ExtractedContent> {
  const tab = tabManager.getTab(tabId);

  return {
    title: tab.title,
    url: tab.url,
    content: `Query: ${tab.metadata.query}\n\nResponse:\n${tab.metadata.response}`,
  };
}
```

### Context Formatting

Extracted content is formatted for LLM consumption:

```typescript
function formatContext(extractedContents: ExtractedContent[]): string {
  return extractedContents
    .map(content => `
═══════════════════════════════════════
Tab: ${content.title}
URL: ${content.url}
═══════════════════════════════════════

${content.content}
    `.trim())
    .join('\n\n');
}
```

### Full Query Construction

```typescript
async function buildFullQuery(
  userQuery: string,
  selectedTabIds: string[]
): Promise<string> {
  const extractedContents = [];

  for (const tabId of selectedTabIds) {
    const content = await ContentExtractor.extractFromTab(tabId);
    extractedContents.push(content);
  }

  const contextText = formatContext(extractedContents);

  // Context comes BEFORE user query
  return `${contextText}\n\n${userQuery}`;
}
```

**Rationale**: Putting context first allows the LLM to "read" the reference material before seeing the question, mimicking natural reading comprehension.

### Token Budget Management

**Problem**: Context can easily exceed model token limits.

**Solution**: Truncation with priority:

```typescript
function manageTokenBudget(
  extractedContents: ExtractedContent[],
  maxContextTokens: number
): ExtractedContent[] {
  // Estimate tokens (rough: 1 token ≈ 4 chars)
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  let totalTokens = 0;
  const result = [];

  for (const content of extractedContents) {
    const tokens = estimateTokens(content.content);

    if (totalTokens + tokens <= maxContextTokens) {
      result.push(content);
      totalTokens += tokens;
    } else {
      // Truncate last item to fit
      const remaining = maxContextTokens - totalTokens;
      const remainingChars = remaining * 4;

      result.push({
        ...content,
        content: content.content.substring(0, remainingChars) + '\n\n[Truncated...]',
      });

      break;
    }
  }

  return result;
}
```

**Future Enhancement**: Use actual tokenizer (e.g., tiktoken for OpenAI).

## Debugging and Transparency

### Full Query Inspection

Users can view the exact query sent to the LLM:

```svelte
<details>
  <summary>View full query ({metadata.fullQuery.length} chars)</summary>
  <pre class="full-query">{metadata.fullQuery}</pre>
</details>
```

This helps users:
- **Understand context inclusion**: "Did the LLM see the right content?"
- **Debug errors**: "Was the query malformed?"
- **Learn prompt engineering**: "How is context structured?"

### Token Usage Display

Each response shows:
```svelte
<div class="metadata">
  <span>Model: {metadata.model}</span>
  <span>Tokens: {metadata.tokensIn} in, {metadata.tokensOut} out</span>
  <span>Cost: ${calculateCost(metadata.tokensIn, metadata.tokensOut, metadata.model)}</span>
</div>
```

### Context Sources

Show which tabs were used as context:

```svelte
<div class="context-sources">
  <strong>Context from {metadata.selectedTabIds.length} tabs:</strong>
  <ul>
    {#each metadata.selectedTabIds as tabId}
      <li>
        <button on:click={() => switchToTab(tabId)}>
          {getTabTitle(tabId)}
        </button>
      </li>
    {/each}
  </ul>
</div>
```

Clicking a source tab switches to it for review.

## UX Patterns

### Quick Actions

**Copy Response**:
```svelte
<button on:click={() => copyToClipboard(metadata.response)}>
  📋 Copy
</button>
```

**Regenerate with Same Context**:
```svelte
<button on:click={() => regenerateQuery(metadata.query, metadata.selectedTabIds)}>
  🔄 Regenerate
</button>
```

**Edit and Retry**:
```svelte
<button on:click={() => editAndRetry(metadata.query, metadata.selectedTabIds)}>
  ✏️ Edit & Retry
</button>
```

### Tab Actions from Response

**Open Links from Response**:
```typescript
// Detect links in markdown response
const links = extractLinksFromMarkdown(metadata.response);

for (const link of links) {
  await ipc.openUrl(link.href);
}
```

**Create Tab from Code Block**:
```svelte
{#each codeBlocks as block}
  <div class="code-block">
    <pre><code>{block.code}</code></pre>
    <button on:click={() => createFileTab(block.code, block.language)}>
      💾 Open as file
    </button>
  </div>
{/each}
```

### Conversation Threading

**Select Previous Response**:
```
User: "Explain asyncio"
→ Response 1

User: [Selects Response 1] "Now show me an example"
→ Response 2

User: [Selects Response 2] "Can you optimize this example?"
→ Response 3
```

This creates a **conversation thread** visible in the tab list:

```
├─ Explain asyncio (Response 1)
│  └─ Now show me an example (Response 2)
│     └─ Can you optimize this example? (Response 3)
```

**Implementation**:
```typescript
interface TabMetadata {
  parentTabId?: string;  // Previous response in thread
}

// When creating response with context
if (selectedTabIds.length === 1 && isLLMResponse(selectedTabIds[0])) {
  metadata.parentTabId = selectedTabIds[0];
}
```

**Visual Threading**:
```svelte
<div class="tab-item" style="padding-left: {getIndentLevel(tab) * 16}px">
  {#if tab.metadata?.parentTabId}
    <span class="thread-indicator">↳</span>
  {/if}
  {tab.title}
</div>
```

## Keyboard Shortcuts

Efficient power-user workflow:

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+L` | Focus URL bar |
| `Ctrl+K` | Focus chat |
| `Ctrl+Enter` | Send query |
| `Ctrl+Shift+C` | Copy response |
| `Ctrl+Shift+R` | Regenerate |
| `Space` | Toggle tab selection |
| `Ctrl+A` | Select all tabs |
| `Ctrl+Shift+A` | Clear selection |

**Implementation**:
```typescript
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    focusChatInput();
  } else if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    sendQuery();
  } else if (e.key === ' ' && isTabListFocused()) {
    e.preventDefault();
    toggleSelectedTab(focusedTabId);
  }
});
```

## Error Handling UX

### Network Errors

```svelte
{#if metadata?.error}
  <div class="error-banner">
    <span class="icon">⚠️</span>
    <div class="message">
      <strong>Error:</strong> {metadata.error}
    </div>
    <button on:click={() => retryQuery()}>
      Retry
    </button>
  </div>
{/if}
```

### Token Limit Errors

```svelte
{#if metadata?.error?.includes('token limit')}
  <div class="error-banner">
    <span class="icon">⚠️</span>
    <div class="message">
      <strong>Token limit exceeded.</strong>
      Try selecting fewer tabs or using a model with larger context.
    </div>
    <button on:click={() => openSettings()}>
      Change model
    </button>
  </div>
{/if}
```

### API Key Errors

```svelte
{#if metadata?.error?.includes('API key')}
  <div class="error-banner">
    <span class="icon">🔑</span>
    <div class="message">
      <strong>Invalid API key.</strong>
      Please check your API key in settings.
    </div>
    <button on:click={() => openSettings()}>
      Update API key
    </button>
  </div>
{/if}
```

## Progressive Disclosure

### Simple Mode (Default)

- Minimal UI: Chat input + tab list
- Context selection via checkboxes
- Quick prompts for common tasks
- **Goal**: Zero learning curve

### Advanced Mode (Optional)

Revealed via settings or keyboard shortcuts:

- **Full query editor**: Edit the complete prompt including context
- **Token budget control**: Set max context tokens
- **Model parameters**: Temperature, top_p, etc.
- **System prompt**: Custom instructions
- **Multi-model queries**: Send to multiple models simultaneously

```svelte
{#if advancedMode}
  <div class="advanced-controls">
    <label>
      Max context tokens:
      <input type="number" bind:value={maxContextTokens} />
    </label>

    <label>
      Temperature:
      <input type="range" min="0" max="2" step="0.1" bind:value={temperature} />
    </label>

    <label>
      System prompt:
      <textarea bind:value={systemPrompt} />
    </label>
  </div>
{/if}
```

## Onboarding

### First Run Experience

1. **Welcome screen**: "This browser combines web browsing with AI assistance"
2. **Example workflow**:
   - Opens 3 example tabs
   - Shows selection checkboxes
   - Pre-fills a query: "Summarize the key points from these articles"
   - Sends query and shows streaming response
3. **Interactive tutorial**: Highlights key UI elements
4. **API key setup**: Guide to getting and entering API key

```typescript
async function runOnboarding() {
  // Open example tabs
  await ipc.openUrl('https://example.com/article1');
  await ipc.openUrl('https://example.com/article2');
  await ipc.openUrl('https://example.com/article3');

  // Show tutorial overlay
  showTutorial([
    {
      element: '.tab-list',
      message: 'These are your open tabs. Check the boxes to include them as context.',
    },
    {
      element: '.chat-panel',
      message: 'Ask questions about your selected tabs here.',
    },
    {
      element: '.send-button',
      message: 'Click Send or press Ctrl+Enter to get an AI response.',
    },
  ]);
}
```

## Accessibility

### Screen Reader Support

```svelte
<div
  class="tab-item"
  role="option"
  aria-selected={$selectedTabs.has(tab.id)}
  aria-label="{tab.title}, {tab.type} tab"
>
  <input
    type="checkbox"
    aria-label="Select for context"
    checked={$selectedTabs.has(tab.id)}
  />
  {tab.title}
</div>
```

### High Contrast Mode

```css
@media (prefers-contrast: high) {
  .tab-item.selected {
    border: 2px solid var(--accent-color);
    background: var(--bg-primary);
  }

  .streaming-indicator {
    border: 2px solid currentColor;
  }
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .streaming-indicator .pulse {
    animation: none;
  }

  * {
    transition: none !important;
  }
}
```

## Analytics and Insights

### Usage Patterns

Track (privacy-preserving) metrics:
- Average tabs selected per query
- Most common query types (via clustering)
- Context size vs. response quality
- User retention (session length)

### Cost Tracking

```svelte
<div class="usage-summary">
  <h3>This Month</h3>
  <ul>
    <li>Queries: {queryCount}</li>
    <li>Tokens: {totalTokens.toLocaleString()}</li>
    <li>Cost: ${totalCost.toFixed(2)}</li>
  </ul>
</div>
```

## Future Enhancements

### 1. Smart Context Suggestion

Auto-suggest relevant tabs:

```
User types: "How do I configure nginx..."

Suggested context:
☐ Tab 5: nginx.conf (opened 10 minutes ago)
☐ Tab 12: Nginx documentation
```

### 2. Context Compression

Use summarization to fit more context:

```
Original: 10,000 tokens
Summarized: 2,000 tokens
Tokens saved: 8,000 (80%)
```

### 3. Multi-Modal Context

Include screenshots automatically:

```typescript
if (model.supportsVision) {
  for (const tabId of selectedTabIds) {
    const screenshot = await captureScreenshot(tabId);
    context.push({ type: 'image', data: screenshot });
  }
}
```

### 4. Collaborative Context

Share tab collections with others:

```
Share link: https://app.example.com/share/abc123

Recipient sees:
- Your selected tabs (as read-only)
- Your query
- Your LLM response
- Can fork to create their own queries
```

### 5. Context Versioning

Track changes to tabs used as context:

```
Tab: Python docs
- Version 1: Used in query at 10:00 AM
- Version 2: Page updated, different content at 2:00 PM

Alert: "Context has changed since your last query. Regenerate?"
```
