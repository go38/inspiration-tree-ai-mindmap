# Design QA — compact in-node actions

- Source visual truth: `/private/tmp/inspiration-tree-audit-2026-07-24/01-home-current.png`
- Desktop implementation: `/private/tmp/inspiration-tree-node-actions-qa/implementation-desktop.png`
- Mobile implementation: `/private/tmp/inspiration-tree-node-actions-qa/implementation-mobile.png`
- Full-view comparison: `/private/tmp/inspiration-tree-node-actions-qa/source-vs-implementation.png`
- Focused comparison: `/private/tmp/inspiration-tree-node-actions-qa/focused-node-comparison.png`
- Desktop viewport and pixels: 1280 × 720 CSS px, 1280 × 720 image px, density 1
- Mobile viewport and pixels: 390 × 844 CSS px, 390 × 844 image px, density 1
- State: default sample map, center node selected, AI sheet collapsed on mobile

## Full-view comparison

The canvas, node positions, connections, typography, palette, top bar, tool rail, and AI panel remain visually consistent with the source. The intended change is limited to node cards: action controls now sit inside each card as a compact bottom-right row.

## Focused comparison

The focused node crop confirms that two- and four-action variants remain inside their node bounds without overlapping titles or notes. Desktop controls render as 24 px circles inside a 30 px action rail. Mobile controls render as 28 px circles inside a 34 px action rail. DOM geometry checks confirmed every sampled action rail is contained by its node rectangle.

## Findings

- No actionable P0, P1, or P2 findings.
- P3: node cards are slightly taller to reserve a clear internal action row. This is intentional and preferable to controls extending outside the card.

## Required fidelity surfaces

- Fonts and typography: unchanged; existing serif hierarchy, weights, line height, and wrapping are preserved.
- Spacing and layout rhythm: action controls move from the text row or outside mobile card to a consistent internal bottom row; card height increases only enough to prevent overlap.
- Colors and visual tokens: existing paper, ink, coral, border, and selected-state tokens are reused.
- Image and asset fidelity: no imagery or assets were added, replaced, or degraded.
- Copy and content: unchanged.

## Interaction and responsive checks

- The center-node add action created one new child node.
- The center-node edit action opened the inline title editor.
- Desktop and mobile layouts keep the action rail within the node rectangle.
- Browser console errors: none.
- Production build completed and all 33 automated tests passed.

## Comparison history

1. Earlier source finding: 34–36 px circular controls consumed the node text row on desktop and extended below node cards on mobile.
2. Fix: introduced a dedicated internal action rail, 24 px desktop controls, 28 px mobile controls, restrained opacity, and explicit card space for the rail.
3. Post-fix evidence: desktop and mobile screenshots plus DOM geometry confirm containment, readable copy, and working edit/add actions.

## Implementation checklist

- [x] Keep all node actions functional.
- [x] Move action controls inside node cards.
- [x] Reduce desktop visual size.
- [x] Preserve a larger mobile target without external overflow.
- [x] Verify desktop and mobile rendering.
- [x] Run build, automated tests, interaction checks, and console-error check.

final result: passed
