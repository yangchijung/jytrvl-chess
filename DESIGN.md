# Mandatory Design Protocol

## Product-wide constraints

All public interfaces must feel like a specific product used by real people, never a generic AI-generated demo.

### Absolutely avoid

- Blue, purple, neon, rainbow, aurora, or mesh gradients.
- Glassmorphism, frosted panels, decorative blur, abstract blobs, particles, or ambient visual effects.
- Obvious floating box shadows, excessive rounded corners, pill-shaped ordinary content, and cards nested inside cards.
- Emoji as navigation, status, or decorative emphasis.
- Generic dashboard shells: sidebar + top KPI cards + charts unless that composition is necessary for the task.
- Oversized icon tiles, arbitrary device mock-ups, filler illustration, or fake luxury imagery.
- Bounce or elastic motion; use restrained 120–220 ms causal motion only, respecting `prefers-reduced-motion`.
- Copy containing `delve`, `seamless`, `elevate`, `vibe`, `unlock`, `leverage`, `robust`, `revolutionary`, `game-changing`, `empower`, `next-level`, `effortless`, `tailored`, or `cutting-edge`; avoid empty equivalents such as「探索無限可能」、「一站式體驗」、「量身打造」與「賦能」.

### Build with restraint

- Use at most three core colours plus one semantic alert colour per surface. Use real, high-contrast, tangible colour relationships rather than effects.
- Use typography, alignment, real content, hierarchy, and whitespace to create quality. Do not use decoration to simulate quality.
- Use a 4 px or 8 px spacing rhythm. Section spacing must be visibly larger than internal spacing.
- UI copy uses direct Taiwan Traditional Chinese. State facts, dates, sources, limits, and uncertainty plainly.
- Each visual element must support a user action, a fact, or meaningful content. Remove any element that cannot be defended.
- Meet WCAG 2.2 AA contrast, keyboard operation, visible focus, 44 × 44 px practical touch targets, text zoom, narrow-screen, long-CJK-text, empty/error/loading, and reduced-motion requirements.

## Required workflow

Before implementing a public-facing screen, document in the pull request or handoff:

1. User task and primary action.
2. Information hierarchy: immediate, next, and on-demand.
3. Why the chosen composition fits the task better than a generic dashboard.
4. The real content/data/evidence grounding the screen.
5. Mobile and accessibility checks performed.

Do not begin from a generic first draft. Build the smallest composition that makes the task clearer.

## JY Games direction: contemporary game room + tournament clarity

The board or playfield is the visual authority. Everything else supports the next move.

- Prioritise the board/playfield, turn, legal action, timer, score, opponent, connection state, difficulty, and replay state.
- Use restrained physical references such as paper, ink, wood, stone, or slate only when they support game legibility; no neon arcade, casino, or fake-3D chrome treatment.
- Each game can have one suitable accent colour, but navigation, focus, controls, status language, and accessibility behaviour must stay consistent.
- Do not signal legal moves, danger, check, selection, or opponent action by colour alone; pair it with outline, pattern, label, shape, or readable motion.
- Keep input and first move fast. Sound/motion are optional and may never delay play.
- Explain AI modes plainly: 簡單、中等、困難, plus the practical difference. Do not overclaim AI ability.
- Tutorials show one board state, one instruction, one testable action, and immediate specific feedback—not a prose wall inside a match.

## Existing UI follow-up

See [2026-10-16 UI/UX audit](docs/design/UI_UX_AUDIT_2026-10-16.md) for source-backed gaps and the review order. Historical mockups and longer animation contracts must be reconciled with this policy before reuse. The audit records pending work, not proof that the current interfaces comply.
