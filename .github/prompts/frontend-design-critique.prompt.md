---
name: "Frontend Design Critique"
description: "Run a severity-ranked frontend design and UX critique with concrete file-level recommendations and implementation plan."
argument-hint: "Describe page/flow to critique and constraints (brand, timeline, scope)."
agent: "First Class Web Designer"
model: "GPT-5 (copilot)"
tools: [read, search, edit]
---

Critique the current frontend design and UX for: {{input}}

Requirements:

- Prioritize findings by severity: Critical, High, Medium, Low.
- Ground each finding in concrete code evidence with file references.
- Distinguish observation vs recommendation.
- Include desktop and mobile considerations.
- Include accessibility and performance implications.

Output format:

1. Executive summary (ES + EN)
2. Findings by severity
3. Recommended fixes (quick wins vs structural)
4. Suggested implementation order (P0, P1, P2)
5. Risks/tradeoffs
