---
name: FRONTEND_DESIGN
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
---

# Frontend Design

Use this skill for any UI/UX design or frontend implementation task. The goal is distinctive, opinionated design — not generic templates.

## Core Principle

**Ground every design decision in the subject matter itself.** Open with the most characteristic element of the subject's world. If the design could be swapped into a completely different project and still "work," the choices aren't specific enough.

## Design Execution

Make deliberate choices across four areas:

| Area | Guidance |
|---|---|
| **Typography** | Treat type as personality. Pair a display face with a body face chosen specifically for this brief — not system defaults |
| **Structure** | Layout should encode information, not decorate it. Hierarchy through space and weight, not decoration |
| **Motion** | Use animation to serve the subject — entrance, feedback, state transitions. Not scattered for effect |
| **Complexity** | Match complexity to the vision. Maximalist or minimal — commit fully |

## Defaults to Actively Avoid

These are hallmarks of generic AI-generated design. Avoid unless the brief specifically calls for them:

- Cream backgrounds with terracotta accents
- Near-black backgrounds with neon highlights
- Broadsheet grid layouts with hairline rules

## Two-Pass Process

**Pass 1 — Design plan (before writing code):**
- Choose a color palette that fits *this* subject specifically
- Select font pairings (display + body)
- Define layout structure and primary visual motif
- Name one "signature element" that will carry through every component

**Pass 2 — Review before building:**
- Audit the plan: are the choices genuinely specific or could they be generic defaults?
- If any choice passes the "swap test" (would work in any other project), replace it

## Writing Integration

Copy serves navigation and understanding:
- Use active voice and specific language
- Controls say exactly what happens when used — no vague labels
- Conversational register, not corporate tone

## Quality Bar

- Every component must be production-ready: accessible, responsive, keyboard-navigable
- No placeholder text, lorem ipsum, or TODO comments in delivered code
- Visual QA: check contrast ratios, spacing consistency, mobile breakpoints
