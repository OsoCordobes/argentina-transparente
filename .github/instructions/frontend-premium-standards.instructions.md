---
description: "Use when editing frontend UX/UI in React/Vite/Tailwind apps. Enforce premium visual standards, token consistency, accessibility, responsive behavior, and performance-aware implementation."
name: "Frontend Premium Standards"
applyTo:
  - "frontend/src/**"
  - "apps/board/src/**"
  - "reports/components/**"
  - "reports/pages/**"
---

# Frontend Premium Standards

## Design Quality

- Favor intentional, distinctive layouts over generic templates.
- Use a clear type scale, spacing rhythm, and hierarchy.
- Keep color and elevation tokenized via variables/tokens when available.

## UX and Interaction

- Optimize first impression: purpose and primary CTA should be clear quickly.
- Add meaningful motion only where it improves comprehension.
- Avoid interaction noise and decorative-only animations.

## Accessibility Baseline

- Use semantic HTML and keyboard-navigable controls.
- Maintain visible focus states.
- Keep color contrast at accessible levels.
- Ensure mobile and desktop behavior is coherent.

## Frontend Engineering

- Prefer reusable components and avoid one-off duplicated patterns.
- Preserve existing design-system primitives unless redesign is explicitly requested.
- Avoid regressions in routing, loading states, and error handling.

## Review Checklist

- Is the visual hierarchy obvious in under 3 seconds?
- Is the experience coherent on mobile and desktop?
- Are spacing, typography, and color consistent?
- Were accessibility basics preserved or improved?
- Did we avoid unnecessary complexity?
