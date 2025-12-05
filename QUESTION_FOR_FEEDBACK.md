# Question: DOM Tree Encoding and Normalization for LLM Context

## Context

I'm building an Electron app that extracts webpage content and sends it as context to an LLM. The challenge is converting the DOM tree into a text representation that's both informative and token-efficient.

## Current Approach

### 1. DOM Extraction (in-browser JavaScript)
```javascript
// Execute in webpage context via webContents.executeJavaScript()
const serializedDOM = {
  title: document.title,
  url: window.location.href,
  headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .map(h => h.textContent?.trim()),
  paragraphs: Array.from(document.querySelectorAll('p'))
    .map(p => p.textContent?.trim())
    .filter(text => text && text.length > 20)
    .slice(0, 50), // Limit to 50 paragraphs
  links: Array.from(document.querySelectorAll('a[href]'))
    .map(a => ({ text: a.textContent?.trim(), href: a.href }))
    .slice(0, 100), // Limit to 100 links
  mainContent: (document.querySelector('main, article, [role="main"]') || document.body)
    .textContent?.trim().substring(0, 50000), // Truncate at 50K chars
  metaTags: {...} // Extract meta[name] and meta[property]
};
```

### 2. Markdown Formatting
Convert structured DOM to markdown-style text:
```markdown
## Document Structure
- [list of headings...]

## Metadata
- description: [meta description]
- keywords: [meta keywords]

## Content
[paragraphs separated by blank lines]

## Links
- [Link Text](url)
```

### 3. Whitespace Normalization
- Trim each line
- Collapse consecutive blank lines to single blank line
- Remove trailing empty lines

## Current Limitations & Questions

### Issues I'm Facing:
1. **Loss of DOM structure**: Flattening to text loses parent-child relationships, nesting depth, element types
2. **Arbitrary limits**: Hard-coded limits (50 paragraphs, 100 links, 50K chars) may cut important content
3. **Semantic ambiguity**: No distinction between nav links vs content links, or header vs footer content
4. **Whitespace handling**: Current normalization may lose intentional spacing (code blocks, lists, formatting)

### Specific Questions:
1. **Should I preserve more structure?** E.g., use a simplified HTML/XML format or JSON tree instead of flattened text?
2. **Better heuristics for main content?** Currently using `<main>`, `<article>`, `[role="main"]` - what about reader mode algorithms?
3. **Dynamic vs static limits?** Should limits be based on token count rather than element count?
4. **Alternative normalization?** Should whitespace normalization be context-aware (preserve spacing in `<pre>`, `<code>`, etc.)?
5. **Semantic filtering?** Should I skip `<nav>`, `<footer>`, `<aside>` entirely? Or mark them differently?

## What I'm Looking For

- **Alternative approaches** to DOM serialization for LLM consumption
- **Best practices** from similar projects (browser automation, web scraping for AI)
- **Tradeoffs** between structure preservation vs token efficiency
- **Better heuristics** for extracting meaningful content vs boilerplate

Has anyone tackled similar challenges? What worked well or didn't work?

---

**Tech Stack**: Electron, TypeScript, executing JavaScript in WebContents context
