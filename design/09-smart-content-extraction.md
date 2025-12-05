# Design Document 09: Smart Content Extraction

## Overview

Smart Content Extraction is a context-aware pipeline for converting web page DOM into text suitable for LLM consumption. Instead of using a one-size-fits-all approach, it intelligently routes pages through different extraction strategies based on content type.

## Problem Statement

**Previous Approach Issues:**
1. **Loss of structure**: Flattening DOM to plain text lost parent-child relationships, semantic meaning
2. **Arbitrary limits**: Hard-coded limits (50 paragraphs, 100 links) were inflexible and could miss important content
3. **Semantic ambiguity**: No distinction between article content vs navigation, or main content vs boilerplate
4. **Whitespace handling**: Aggressive normalization could lose intentional formatting (code blocks, lists)
5. **Token inefficiency**: Extracting everything then truncating wasted processing and could cut mid-sentence

## Solution: Context-Aware Routing

The Smart Content Extractor uses a **routing pattern** to apply different strategies based on page type:

```
┌─────────────┐
│  Web Page   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Get Raw HTML   │
└──────┬──────────┘
       │
       ▼
┌─────────────────────┐
│  Route Decision     │
│  (Article vs App?)  │
└──┬──────────────┬───┘
   │              │
   ▼              ▼
┌─────────┐  ┌──────────┐
│ Article │  │   App    │
│  Path   │  │   Path   │
└────┬────┘  └─────┬────┘
     │             │
     ▼             ▼
┌──────────┐  ┌──────────┐
│ Markdown │  │   HTML   │
└──────────┘  └──────────┘
```

### Article Path (Blogs, News, Documentation)

**When**: High text-to-link ratio, semantic HTML tags (`<article>`, `<main>`)

**Processing**:
1. **Mozilla Readability**: Industry-standard content extraction (used by Firefox Reader Mode)
   - Removes ads, navigation, footers, sidebars
   - Identifies main content area
   - Preserves semantic structure
2. **Turndown**: Converts HTML → Markdown
   - Headings become `#` hierarchy (preserves document outline)
   - Lists become `-` bullet points
   - Code blocks become ` ``` ` fenced blocks
   - Links become `[text](url)`
3. **Token budgeting**: Truncate at character limit (1 token ≈ 4 chars)

**Output Example**:
```markdown
# Main Heading

Introduction paragraph with important information.

## Section 1

Content here with **bold** and *italic* formatting.

### Subsection

- Bullet point 1
- Bullet point 2

[Read more](https://example.com)

...(truncated)
```

**Benefits**:
- Clean, readable text for LLMs
- Structure preserved via Markdown headings
- Automatic boilerplate removal
- Efficient token usage

### App Path (SPAs, Dashboards, Interactive Pages)

**When**: Low text-to-link ratio, interactive elements, no clear article structure

**Processing**:
1. **Recursive DOM Walker**: Custom tree traversal
   - Skips noise (`<script>`, `<style>`, `<svg>`, hidden elements)
   - Preserves semantic tags (`<button>`, `<input>`, `<nav>`, `<header>`)
   - Keeps important attributes (`href`, `aria-label`, `placeholder`, `type`, `role`)
   - Flattens unnecessary `<div>` wrappers
   - Normalizes whitespace within text nodes (`/\s+/g → ' '`)
2. **Token budgeting**: Stops recursion when character limit reached
3. **Structure preservation**: Outputs simplified HTML with semantic meaning

**Output Example**:
```html
<header>
  <nav>
    <a href="/home">Home</a>
    <a href="/dashboard">Dashboard</a>
  </nav>
</header>
<main>
  <h1>User Dashboard</h1>
  <button type="submit">Save Changes</button>
  <input placeholder="Enter your name" type="text">
</main>
...
```

**Benefits**:
- Preserves interactive element types
- Maintains page structure (nav, main, sections)
- Captures UI semantics (buttons, inputs, labels)
- LLMs can understand page functionality

## Implementation Details

### Architecture

**Location**: `src/main/services/smart-content-extractor.ts` (~246 lines)

**Key Design Decisions**:
1. **Server-side processing**: Runs in Electron main process (Node.js), not browser
   - No bundling complexity
   - Full access to npm libraries (Readability, Turndown, JSDOM)
   - Simpler build pipeline
2. **Single responsibility**: SmartContentExtractor only does extraction
   - ContentExtractor orchestrates (calls SmartContentExtractor, captures screenshots)
   - Separation of concerns
3. **Token-aware limiting**: Budget parameter controls output size
   - Default: 12,500 tokens (~50K characters)
   - Stops processing when limit reached (efficient)
   - Prevents mid-word truncation in Article mode

### Integration

**Updated Files**:
- `src/main/services/smart-content-extractor.ts` (new)
- `src/main/services/content-extractor.ts` (updated to use SmartContentExtractor)
- `src/types.ts` (added metadata field to ExtractedContent)

**Legacy Support**:
- Old `serializeDOM()` method preserved as `extractFromTabLegacy()`
- Allows gradual migration or fallback if needed

### Routing Heuristic

```typescript
isProbablyArticle(doc: Document): boolean {
  // 1. Check for semantic article tags
  const hasArticleTag = doc.querySelector('article') !== null;
  const hasMainTag = doc.querySelector('main') !== null;

  // 2. Calculate text density
  const totalTextLength = sum(p.textContent.length for all <p>)
  const totalLinkLength = sum(a.textContent.length for all <a>)
  const textDensity = totalTextLength / (totalLinkLength + 1)

  // 3. Route decision
  return hasArticleTag || hasMainTag || textDensity > 3
}
```

**Rationale**:
- Semantic tags are strong signals (authors mark articles explicitly)
- Text density distinguishes content-heavy pages (blogs) from navigation-heavy pages (apps)
- Threshold of 3:1 is conservative (avoids false positives)

## Comparison: Before vs After

| Aspect | Before (Manual Extraction) | After (Smart Extraction) |
|--------|---------------------------|-------------------------|
| **Structure** | Lost (flattened to text) | Preserved (Markdown/HTML) |
| **Limits** | Arbitrary (50 paras, 100 links) | Token-aware (dynamic) |
| **Semantic Awareness** | None (treats all pages same) | Context-aware (article vs app) |
| **Whitespace** | Manual normalization | Context-aware (Markdown for articles, HTML for apps) |
| **Boilerplate** | Included (nav, footer, ads) | Removed (Readability for articles) |
| **Token Efficiency** | Extract all → truncate | Budget-aware stopping |
| **Implementation** | In-browser JavaScript | Server-side (Node.js) |
| **Dependencies** | None (manual selectors) | Readability, Turndown, JSDOM |
| **Code Size** | ~150 lines (scattered) | ~246 lines (single file) |

## Testing Strategy

### Unit Tests
- Heuristic routing (article vs app detection)
- Token budget enforcement
- Whitespace normalization
- Structure preservation

### Integration Tests
- Real-world websites:
  - **Articles**: Blog posts, news articles, MDN docs
  - **Apps**: GitHub, Gmail, Jira, dashboards
- Edge cases:
  - Very long articles (budget truncation)
  - Heavily nested DOM (recursion limits)
  - Pages with both article and app characteristics

### Manual Testing Checklist
- [ ] Blog post (e.g., Medium article) → Markdown with headings
- [ ] News article (e.g., NYTimes) → Clean text, no ads
- [ ] Documentation (e.g., MDN) → Structured Markdown
- [ ] SPA dashboard (e.g., GitHub) → Semantic HTML with buttons/links
- [ ] Mixed content page → Reasonable routing decision
- [ ] Very long page → Respects token budget, no mid-sentence cuts

## Future Enhancements

### Potential Improvements
1. **Adaptive budgeting**: Allocate tokens based on content importance (headings get priority)
2. **Custom routing**: Allow users to force article/app mode for specific domains
3. **Metadata enrichment**: Extract structured data (JSON-LD, Open Graph)
4. **Code syntax preservation**: Special handling for `<pre>` blocks with language detection
5. **Table extraction**: Convert HTML tables to Markdown tables or CSV
6. **Image descriptions**: Extract alt text and figure captions

### Performance Optimizations
1. **Streaming extraction**: Process DOM incrementally for very large pages
2. **Caching**: Cache extracted content for recently visited pages
3. **Parallel processing**: Extract from multiple tabs concurrently

## Dependencies

### New Runtime Dependencies
```json
{
  "@mozilla/readability": "^0.5.0",
  "turndown": "^7.2.0",
  "jsdom": "^25.0.1"
}
```

### Why These Libraries?

**@mozilla/readability**:
- Industry standard (powers Firefox Reader Mode)
- Battle-tested on millions of websites
- Excellent heuristics for content extraction
- Active maintenance by Mozilla

**turndown**:
- Robust HTML → Markdown conversion
- Configurable (heading styles, code blocks)
- Handles edge cases (nested lists, tables)
- Lightweight (~50KB)

**jsdom**:
- Full DOM implementation in Node.js
- Required by Readability
- Allows server-side DOM manipulation
- Well-maintained, widely used

## Migration Guide

### For Developers

**Before** (manual extraction):
```typescript
const serializedDOM = await ContentExtractor.serializeDOM(view);
const formatted = formatSerializedDOM(serializedDOM);
```

**After** (smart extraction):
```typescript
const smartContent = await SmartContentExtractor.extract(view);
// smartContent.content is already formatted!
```

**Benefits**:
- Simpler API (one call instead of two)
- Content pre-formatted (no separate formatting step)
- Metadata included (extraction type, token estimate)

### Backward Compatibility

Legacy extraction still available:
```typescript
const legacyContent = await ContentExtractor.extractFromTabLegacy(view, tabId);
```

## Related Documents

- [Design Doc 04: User Experience and Context Management](./04-user-experience-and-context-management.md) - Original context extraction design
- [Design Doc 03: Flexible Tab System](./03-flexible-tab-system.md) - Tab architecture that uses content extraction

## References

- [Mozilla Readability GitHub](https://github.com/mozilla/readability)
- [Turndown GitHub](https://github.com/mixmark-io/turndown)
- [JSDOM Documentation](https://github.com/jsdom/jsdom)
- [Web Content Accessibility Guidelines (WCAG)](https://www.w3.org/WAI/WCAG21/quickref/) - Semantic HTML best practices
