# Resource Lifecycle Documentation Suite

**Purpose:** Comprehensive guide to resource and lifecycle management in llm-sv-tabs.

**Status:** Living documentation - update as patterns evolve.

---

## 📚 Document Overview

This suite consists of four interconnected documents, each serving a specific purpose:

| Document | Purpose | Audience | When to Use |
|----------|---------|----------|-------------|
| **[RESOURCE_LIFECYCLE_DESIGN.md](./RESOURCE_LIFECYCLE_DESIGN.md)** | Design patterns & principles | All contributors | Writing new code, understanding architecture |
| **[RESOURCE_LIFECYCLE_AUDIT.md](./RESOURCE_LIFECYCLE_AUDIT.md)** | Retrospective audit template | Tech leads, auditors | Quarterly audits, investigating bugs |
| **[REFACTORING_GUIDE.md](./REFACTORING_GUIDE.md)** | Step-by-step refactoring recipes | Developers | Fixing bugs, improving existing code |
| **[CODE_REVIEW_CHECKLIST.md](./CODE_REVIEW_CHECKLIST.md)** | Quick reference for reviews | Reviewers, authors | PR reviews, pre-commit checks |

---

## 🎯 How to Use This Documentation

### For New Contributors

**Start here:**
1. Read **RESOURCE_LIFECYCLE_DESIGN.md** sections 1-3 (Core Principles & Ownership)
2. Skim lifecycle flows in section 4
3. Review Svelte 5 rune patterns in section 5
4. Keep **CODE_REVIEW_CHECKLIST.md** open while coding

**When writing your first PR:**
- Reference design patterns from RESOURCE_LIFECYCLE_DESIGN.md
- Run through CODE_REVIEW_CHECKLIST.md yourself before submitting
- Link to relevant design doc sections in PR description

---

### For Regular Contributors

**Daily workflow:**
- **Writing new feature:** Reference RESOURCE_LIFECYCLE_DESIGN.md for patterns
- **Fixing bug:** Use REFACTORING_GUIDE.md recipes for systematic fixes
- **Reviewing PR:** Use CODE_REVIEW_CHECKLIST.md as review guide
- **Investigating leak:** Start with RESOURCE_LIFECYCLE_AUDIT.md relevant section

**Weekly:**
- Skim CODE_REVIEW_CHECKLIST.md to refresh memory on common pitfalls
- Update design docs if you discover new patterns

---

### For Maintainers

**Monthly:**
- Review recent bugs/PRs for patterns not covered in docs
- Update REFACTORING_GUIDE.md with new recipes
- Add new anti-patterns to design docs

**Quarterly:**
- Execute RESOURCE_LIFECYCLE_AUDIT.md in full
- Document findings in `AUDIT_FINDINGS_YYYY-MM.md`
- Create issues for discovered problems
- Prioritize fixes based on severity

**When onboarding:**
- Walk through RESOURCE_LIFECYCLE_DESIGN.md together
- Pair on first PR with checklist in hand
- Schedule follow-up to discuss patterns learned

---

## 🔄 Document Relationships

```
RESOURCE_LIFECYCLE_DESIGN.md (Principles & Patterns)
  ↓ Referenced by
CODE_REVIEW_CHECKLIST.md (Quick validation)
  ↓ Points to
REFACTORING_GUIDE.md (Step-by-step fixes)
  ↓ Validates against
RESOURCE_LIFECYCLE_AUDIT.md (Comprehensive audit)
  ↓ Findings update
RESOURCE_LIFECYCLE_DESIGN.md (Improved patterns)
```

**Example flow:**
1. **Audit** finds missing listener cleanup in 5 components
2. **Audit** links to **Design Doc** section 5 (IPC Listener Scoping)
3. Developer uses **Refactoring Guide** recipe 2 to fix components
4. Reviewer uses **Checklist** section 4 to validate fixes
5. **Design Doc** updated with lessons learned

---

## 📖 Quick Reference by Scenario

### Scenario: Writing a new Svelte component with IPC listeners

**Read:**
- Design Doc → Section 5 (Svelte 5 Rune Patterns)
- Design Doc → Section 6 (IPC Listener Scoping)

**Pattern to follow:**
```svelte
<script>
  let { tabId } = $props();
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = window.electron.onTabUpdate((data) => {
      if (data.id === tabId) { /* handle */ }
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
</script>
```

**Validate with:**
- Checklist → Section 4 (IPC Listener Changes)

---

### Scenario: Adding a new resource type to Main process

**Read:**
- Design Doc → Section 2 (Explicit Ownership)
- Design Doc → Section 3 (Cleanup Before Deletion)

**Steps:**
1. Add to ownership table (Design Doc section 2)
2. Implement cleanup method
3. Add cleanup to relevant lifecycle (e.g., `closeTab()`)
4. Register with shutdown manager if app-lifetime
5. Document lifecycle flow (Design Doc section 4)

**Validate with:**
- Checklist → Section 2 (Main Process Changes)
- Refactoring Guide → Section 5 (Cleanup order checklist)

---

### Scenario: Fixing a memory leak

**Read:**
- Audit → Section 4 (Memory & Performance Audits)
- Refactoring Guide → Section 6 (Validation Checklist)

**Steps:**
1. Reproduce leak with heap snapshots
2. Identify leaking resource
3. Find matching recipe in Refactoring Guide (sections 2-5)
4. Apply fix following recipe
5. Validate with memory leak test (Refactoring Guide section 6)
6. Add regression test

**Update:**
- Add test to prevent regression
- Update Design Doc if new pattern discovered

---

### Scenario: Reviewing a PR

**Read:**
- Checklist → Section matching files changed

**Process:**
1. Scan changed files
2. For each file type, run through relevant checklist section
3. Flag issues with severity (🔴 Critical, 🟡 High, 🟢 Medium)
4. Reference Design Doc or Refactoring Guide in comments
5. Verify tests exist (Checklist section 9)

**Example comment:**
```markdown
🟡 HIGH: Missing listener cleanup

This adds a listener in onMount but no cleanup in onDestroy.
This will cause a memory leak.

Fix: See [REFACTORING_GUIDE.md](./REFACTORING_GUIDE.md#2-refactoring-recipe-component-ipc-listeners)
Pattern: [RESOURCE_LIFECYCLE_DESIGN.md](./RESOURCE_LIFECYCLE_DESIGN.md#component-lifetime-listeners)
```

---

### Scenario: Investigating a race condition

**Read:**
- Design Doc → Section 3.1 (Stale Response Guard)
- Refactoring Guide → Section 3 (Stale Async Response Guards)

**Debug:**
1. Identify competing async operations
2. Add logging to trace data flow
3. Reproduce with rapid state changes
4. Check for guard variables in code
5. Apply guard pattern from Refactoring Guide
6. Test with race condition test (Refactoring Guide section 6)

---

## 🛠️ Maintenance

### Updating These Docs

**When to update:**
- New resource type added → Update ownership table (Design Doc section 2)
- New lifecycle pattern discovered → Add to Design Doc section 4
- Bug fixed that wasn't covered → Add recipe to Refactoring Guide
- New pitfall found → Add to Design Doc section 7 (Anti-Patterns)
- Audit finds systemic issue → Update Audit template with new check

**How to update:**
1. Make changes in relevant doc
2. Update "Last Updated" date in doc header
3. Link related sections across docs
4. Add example if pattern is complex
5. Create PR with "docs:" prefix
6. Get review from maintainer

**PR description template:**
```markdown
## Documentation Update: [Brief description]

**Documents changed:**
- RESOURCE_LIFECYCLE_DESIGN.md: Added new pattern X
- REFACTORING_GUIDE.md: Added recipe for Y

**Reason:**
Fixed bug #123 which revealed gap in documentation for Z pattern.

**Validation:**
- [ ] Examples are accurate and tested
- [ ] Cross-references between docs updated
- [ ] Quick reference updated if needed
```

---

## 📊 Metrics & Success Criteria

Track these metrics to measure documentation effectiveness:

### Code Quality Metrics
- **Memory leaks reported:** Target < 1 per quarter
- **Listener cleanup bugs:** Target 0 (should be caught in review)
- **Race conditions in streaming:** Target 0
- **PR review cycles:** Target < 2 (clear patterns reduce back-and-forth)

### Documentation Usage Metrics
- **PR descriptions linking to docs:** Target > 50%
- **Code comments referencing lifecycle docs:** Growing trend
- **Audit completion time:** Target < 8 hours (well-defined checklist)

### Review these quarterly and adjust documentation if metrics regress.

---

## 🔗 External Resources

### Electron Documentation
- [BrowserView Lifecycle](https://www.electronjs.org/docs/latest/api/browser-view)
- [WebContents Destruction](https://www.electronjs.org/docs/latest/api/web-contents#contentsdestroy)
- [IPC Best Practices](https://www.electronjs.org/docs/latest/tutorial/ipc)

### Svelte 5 Documentation
- [Runes Overview](https://svelte-5-preview.vercel.app/docs/runes)
- [$state](https://svelte-5-preview.vercel.app/docs/runes#$state)
- [$derived](https://svelte-5-preview.vercel.app/docs/runes#$derived)
- [$effect](https://svelte-5-preview.vercel.app/docs/runes#$effect)

### Testing Resources
- [Vitest](https://vitest.dev/)
- [Chrome DevTools Memory Profiling](https://developer.chrome.com/docs/devtools/memory-problems/)

---

## ❓ FAQ

### Q: Which document should I read first?
**A:** Start with RESOURCE_LIFECYCLE_DESIGN.md sections 1-3. This gives you the mental model. Then use other docs as reference.

### Q: Do I need to read all documents to contribute?
**A:** No. Read Design Doc core principles, then use Checklist for reviews and Refactoring Guide when fixing bugs.

### Q: How do I know if my code follows the patterns?
**A:** Run through CODE_REVIEW_CHECKLIST.md yourself before submitting PR. If all checks pass, you're good.

### Q: What if I find a pattern not covered in these docs?
**A:** Great! Document it:
1. Add pattern to RESOURCE_LIFECYCLE_DESIGN.md
2. Add recipe to REFACTORING_GUIDE.md if it solves a common problem
3. Add check to CODE_REVIEW_CHECKLIST.md if it should be validated in reviews

### Q: How often should we run the full audit?
**A:** Quarterly for full audit. Monthly spot-checks for high-risk areas (memory, listeners).

### Q: Can I copy patterns from these docs into my code?
**A:** Absolutely! That's the point. Copy, adapt, and link to the doc in comments.

### Q: What if the design pattern doesn't fit my use case?
**A:** Discuss with maintainers. Either:
1. Your use case is an exception (document it as such)
2. The pattern needs refinement (update the docs)

---

## 🎓 Training Plan for New Team Members

### Week 1: Foundation
- [ ] Read RESOURCE_LIFECYCLE_DESIGN.md sections 1-4
- [ ] Review existing code with Design Doc patterns in mind
- [ ] Shadow a PR review with maintainer, discuss checklist items

### Week 2: Practice
- [ ] Pick a small refactoring from backlog
- [ ] Follow REFACTORING_GUIDE.md recipe
- [ ] Submit PR with Design Doc references
- [ ] Self-review with CODE_REVIEW_CHECKLIST.md

### Week 3: Review
- [ ] Review 2-3 PRs using CODE_REVIEW_CHECKLIST.md
- [ ] Pair with maintainer on complex PR
- [ ] Discuss findings and patterns

### Week 4: Autonomy
- [ ] Implement new feature following patterns
- [ ] Review PRs independently
- [ ] Suggest documentation improvements

**Graduation criteria:**
- Submitted 2+ PRs following design patterns
- Reviewed 3+ PRs with checklist
- Found and documented 1 new pattern or anti-pattern

---

## 📝 Templates

### PR Description Template
```markdown
## Summary
[Brief description of changes]

## Design Patterns Used
- Resource ownership: [Main/Renderer] owns [Resource type]
- Cleanup: Follows pattern from RESOURCE_LIFECYCLE_DESIGN.md#[section]
- Svelte runes: Uses $[state/derived/effect] for [purpose]

## Checklist
- [ ] Reviewed CODE_REVIEW_CHECKLIST.md sections [X, Y, Z]
- [ ] Added tests for lifecycle (create/update/destroy)
- [ ] No new listeners without cleanup
- [ ] No new $effects without cleanup returns

## Related Docs
- Design pattern: [RESOURCE_LIFECYCLE_DESIGN.md](./RESOURCE_LIFECYCLE_DESIGN.md)#[section]
- If refactoring: Followed recipe from [REFACTORING_GUIDE.md](./REFACTORING_GUIDE.md)#[section]
```

### Bug Report Template (Lifecycle-related)
```markdown
## Bug Description
[What's wrong]

## Suspected Lifecycle Issue
- [ ] Memory leak (resource not cleaned up)
- [ ] Race condition (stale data, no guard)
- [ ] Listener leak (no cleanup in onDestroy)
- [ ] Infinite loop ($effect pattern)
- [ ] Other: [describe]

## Reproduction
1. [Steps]

## Expected Behavior
[What should happen according to RESOURCE_LIFECYCLE_DESIGN.md]

## Actual Behavior
[What actually happens]

## Relevant Docs
- Pattern violated: [RESOURCE_LIFECYCLE_DESIGN.md](./RESOURCE_LIFECYCLE_DESIGN.md)#[section]
- Audit item: [RESOURCE_LIFECYCLE_AUDIT.md](./RESOURCE_LIFECYCLE_AUDIT.md)#[section]
```

---

## 🚀 Getting Started (TL;DR)

**First time here?**
1. Read: [RESOURCE_LIFECYCLE_DESIGN.md](./RESOURCE_LIFECYCLE_DESIGN.md) (Core Principles section)
2. Skim: [CODE_REVIEW_CHECKLIST.md](./CODE_REVIEW_CHECKLIST.md)
3. Write code following patterns
4. Self-review with checklist before PR

**Fixing a bug?**
1. Find matching recipe in [REFACTORING_GUIDE.md](./REFACTORING_GUIDE.md)
2. Follow step-by-step instructions
3. Validate with test checklist

**Reviewing a PR?**
1. Use [CODE_REVIEW_CHECKLIST.md](./CODE_REVIEW_CHECKLIST.md)
2. Reference [RESOURCE_LIFECYCLE_DESIGN.md](./RESOURCE_LIFECYCLE_DESIGN.md) in comments
3. Ensure tests exist

**Running an audit?**
1. Use [RESOURCE_LIFECYCLE_AUDIT.md](./RESOURCE_LIFECYCLE_AUDIT.md) template
2. Document findings
3. Create issues with priority
4. Update design docs with lessons learned

---

## 📧 Feedback & Questions

**Found an issue in these docs?**
- Create issue with label `documentation`
- Propose changes in PR with "docs:" prefix

**Have questions?**
- Ask in team chat with link to relevant doc section
- Schedule pairing session with maintainer

**Want to propose new pattern?**
- Document in PR to RESOURCE_LIFECYCLE_DESIGN.md
- Include example code and rationale
- Add corresponding recipe to REFACTORING_GUIDE.md if applicable

---

**Last Updated:** 2025-12-24
**Next Review:** 2025-03-24 (Quarterly)
