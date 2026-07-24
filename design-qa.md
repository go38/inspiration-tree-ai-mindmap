# Design QA — v0.13.0 natural tree view

- Source visual truth: `/Users/eric/Downloads/產生的圖片 2.png`
- Desktop implementation: `/private/tmp/inspiration-tree-organic-lines-final-2.png`
- Mobile implementation: `/private/tmp/inspiration-tree-option2-mobile.png`
- Full-view comparison: `/private/tmp/inspiration-tree-organic-lines-comparison.png`
- Source pixels: 1487 × 1058
- Desktop viewport and pixels: 1536 × 1024 CSS px, 1536 × 1024 image px, density 1
- Mobile viewport and pixels: 390 × 844 CSS px, 390 × 844 image px, density 1
- Comparison normalization: source and desktop captures were proportionally contained in equal 768 × 512 panels on the same warm-paper background.
- State: default sample map, tree view active, center node selected; mobile AI sheet collapsed.

## Full-view comparison

The implementation preserves the reference’s app shell, three-mode switch, warm dotted canvas, bottom-center root, compact in-node controls, and persistent AI panel. Its connections now read as a tree: one neutral trunk rises from the root, colored limbs peel away at staggered heights, then taper toward their child cards. The first-level crown is vertically staggered so the boughs have room to curve without crossing sibling cards.

## Focused comparison

No separate crop was required: at 1536 × 1024, the equal-size comparison clearly shows node typography, compact action rows, connection thickness, card borders, selected-root treatment, three-mode switch, search, layout controls, and AI panel. DOM interaction checks supplied additional evidence for search highlighting, branch collapse, and inline editing.

## Findings

- No actionable P0, P1, or P2 findings remain.
- P3: the implementation uses the real sample hierarchy and deterministic leaf slots, so its four primary branches form a wider crown than the illustrative attachment. This is an intentional data-faithful deviation.
- P3: mobile at the 50% minimum zoom shows the center and inner crown while outer leaves can require horizontal panning. This preserves readable node controls and matches the intended pan/zoom mobile behavior.

## Required fidelity surfaces

- Fonts and typography: the existing serif node hierarchy, sans-serif controls, weights, line heights, and compact labels are preserved; titles and notes remain readable at desktop fit.
- Spacing and layout rhythm: the root is anchored low, hierarchy levels use a 250 px stage gap, first-level outer and inner limbs are vertically staggered, leaf slots use a 212 px rhythm, and automatic tree fit is capped at 110% to retain breathing room.
- Colors and visual tokens: existing paper, ink, coral, sage, sun, border, shadow, and selected-state tokens are reused; the shared trunk uses warm bark brown and each outgoing limb inherits the child tone.
- Image quality and asset fidelity: the target contains no external imagery requiring replacement. The implementation uses the product’s existing CSS/SVG connection renderer, with no raster degradation or placeholder assets.
- Copy and content: all product copy, sample-node text, action labels, search, AI suggestions, and navigation remain intact; only the new `樹狀` mode label and tree-specific feedback were added.

## Interaction and responsive checks

- Three-mode switch exposes `心智圖`、`樹狀`、`大綱` on desktop and mobile.
- Tree mode rendered seven nodes; collapsing `身心健康` reduced the visible count to six and expanding restored seven.
- Searching `晨間散步` produced exactly one highlighted node.
- Editing `關係與連結` opened one inline editor; cancel closed it without changing data.
- Mobile 390 × 844 preserved the mode switch, search, smart layout, fit controls, 50% zoom, canvas panning, and collapsed AI sheet.
- Browser console errors: none.
- Production build completed and all 40 automated tests passed.

## Comparison history

1. Initial option-2 comparison finding (P2): the implementation was vertically compressed, auto-fit enlarged the crown to 130%, a helper hint occupied source whitespace, and first-level branches were too thin to read as a trunk.
2. First fixes: increased the tree level gap, capped tree fit at 110%, hid the canvas hint in tree mode, and strengthened first-level branches.
3. Attachment comparison finding (P2): all colored branches still radiated from one central junction, and the far-right branch crossed behind a sibling card.
4. Final fixes: replaced the star junction with one continuous bark-colored trunk, staggered branch peel points by crown position, increased the hierarchy gap to 250 px, and raised inner first-level nodes above outer nodes.
5. Post-fix evidence: `/private/tmp/inspiration-tree-organic-lines-comparison.png` shows a shared trunk, staged colored boughs, smooth tapering, and unobstructed sibling cards beside the user-provided attachment.

## Implementation checklist

- [x] Keep radial mind map coordinates unchanged.
- [x] Add deterministic bottom-up tree layout.
- [x] Preserve search, collapse, edit, add, AI focus, zoom, pan, and smart layout.
- [x] Export PNG/PDF from the active tree layout.
- [x] Keep all node controls inside their cards.
- [x] Verify desktop and mobile rendering.
- [x] Run build, automated tests, interaction checks, console checks, and side-by-side visual QA.

final result: passed
