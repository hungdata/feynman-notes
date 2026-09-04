/**
 * Pure, DOM-independent placement for floating property panels.
 *
 * The caller supplies positions in the same coordinate space as `viewport`
 * (normally canvas client coordinates).  A panel's measured `width` and
 * `height` should come from getBoundingClientRect; `panelSize` is only the
 * initial fallback before the first measurement is available.
 */

export const DEFAULT_PANEL_GAP = 16;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const unique = (values) => [...new Set(values.map((value) => Math.round(value * 1000) / 1000))];

const rectRight = (rect) => rect.x + rect.width;
const rectBottom = (rect) => rect.y + rect.height;

export const normalizePanelViewport = (viewport = {}) => {
  const x = finite(viewport.x, finite(viewport.left));
  const y = finite(viewport.y, finite(viewport.top));
  const width = Math.max(0, finite(viewport.width, finite(viewport.right) - x));
  const height = Math.max(0, finite(viewport.height, finite(viewport.bottom) - y));
  return { x, y, width, height, right: x + width, bottom: y + height };
};

export const panelsOverlap = (first, second, gap = 0) =>
  first.x < rectRight(second) + gap
  && rectRight(first) + gap > second.x
  && first.y < rectBottom(second) + gap
  && rectBottom(first) + gap > second.y;

export const panelIsInside = (panel, viewport) => {
  const bounds = normalizePanelViewport(viewport);
  return panel.x >= bounds.x
    && panel.y >= bounds.y
    && rectRight(panel) <= bounds.right
    && rectBottom(panel) <= bounds.bottom;
};

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const normalisePanel = (panel, fallbackSize, viewport) => {
  const measuredWidth = Math.max(1, finite(panel.width, fallbackSize.width));
  const measuredHeight = Math.max(1, finite(panel.height, fallbackSize.height));
  // A narrow/mobile viewport cannot physically contain a wider panel.  The
  // manager returns the constrained dimensions so the view can apply them as
  // inline max-width/max-height instead of allowing a clipped panel.
  const width = Math.min(measuredWidth, viewport.width);
  const height = Math.min(measuredHeight, viewport.height);
  const preferredX = finite(panel.preferredX, finite(panel.x, viewport.x));
  const preferredY = finite(panel.preferredY, finite(panel.y, viewport.y));
  return {
    ...panel,
    width,
    height,
    measuredWidth,
    measuredHeight,
    constrained: width !== measuredWidth || height !== measuredHeight,
    preferredX,
    preferredY,
  };
};

const rectFits = (rect, bounds) => panelIsInside(rect, bounds);

const hasCollision = (candidate, placed, gap) => placed.some((panel) => panelsOverlap(candidate, panel, gap));

const asCandidate = (x, y, placement) => ({ x, y, placement });

const candidatesAtPreferredPosition = (panel, bounds, gap) => {
  const preferredX = clamp(panel.preferredX, bounds.x, bounds.right - panel.width);
  const preferredY = clamp(panel.preferredY, bounds.y, bounds.bottom - panel.height);
  const currentX = finite(panel.x, preferredX);
  const currentY = finite(panel.y, preferredY);
  const candidates = [];

  // Re-layouts keep a panel where it already was whenever that location still
  // works. This stops a new panel from making older panels jump around.
  if (panel.x !== undefined && panel.y !== undefined) {
    candidates.push(asCandidate(
      clamp(currentX, bounds.x, bounds.right - panel.width),
      clamp(currentY, bounds.y, bounds.bottom - panel.height),
      "existing",
    ));
  }

  candidates.push(
    asCandidate(preferredX, preferredY, "preferred"),
    asCandidate(preferredX + panel.width + gap, preferredY, "right"),
    asCandidate(preferredX, preferredY + panel.height + gap, "bottom"),
    asCandidate(preferredX - panel.width - gap, preferredY, "left"),
    asCandidate(preferredX, preferredY - panel.height - gap, "top"),
  );
  return candidates;
};

const gridCandidates = (panel, bounds, placed, gap) => {
  const preferredX = clamp(panel.preferredX, bounds.x, bounds.right - panel.width);
  const preferredY = clamp(panel.preferredY, bounds.y, bounds.bottom - panel.height);
  const xValues = unique([
    bounds.x,
    bounds.right - panel.width,
    preferredX,
    ...placed.flatMap((item) => [item.x - panel.width - gap, rectRight(item) + gap]),
  ]).filter((x) => x >= bounds.x && x <= bounds.right - panel.width);
  const yValues = unique([
    bounds.y,
    bounds.bottom - panel.height,
    preferredY,
    ...placed.flatMap((item) => [item.y - panel.height - gap, rectBottom(item) + gap]),
  ]).filter((y) => y >= bounds.y && y <= bounds.bottom - panel.height);

  return xValues.flatMap((x) => yValues.map((y) => asCandidate(x, y, "grid")))
    .sort((first, second) => {
      const firstDistance = Math.abs(first.x - preferredX) + Math.abs(first.y - preferredY);
      const secondDistance = Math.abs(second.x - preferredX) + Math.abs(second.y - preferredY);
      return firstDistance - secondDistance || first.y - second.y || first.x - second.x;
    });
};

const findAvailablePosition = (panel, bounds, placed, gap) => {
  const candidates = [
    ...candidatesAtPreferredPosition(panel, bounds, gap),
    ...gridCandidates(panel, bounds, placed, gap),
  ];
  const seen = new Set();
  return candidates.find((candidate) => {
    const key = `${candidate.x}:${candidate.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const rect = { ...panel, x: candidate.x, y: candidate.y };
    return rectFits(rect, bounds) && !hasCollision(rect, placed, gap);
  }) || null;
};

const nextContentHeight = (bounds, panel, gap) => Math.max(
  bounds.height + panel.height + gap,
  panel.height,
);

/**
 * Places property panels without overlap.
 *
 * The result is deliberately deterministic: earlier panels keep their valid
 * existing/preferred position; only a colliding newly opened panel is moved.
 * When the visible viewport has no free room, the result grows `contentHeight`
 * and sets `requiresScroll`. Render the host with that scrollable height rather
 * than clipping or stacking the panels.
 */
export const panelLayoutManager = (
  panels = [],
  viewport,
  panelSize = { width: 286, height: 420 },
  gap = DEFAULT_PANEL_GAP,
) => {
  const visibleViewport = normalizePanelViewport(viewport);
  const fallbackSize = {
    width: Math.max(1, finite(panelSize?.width, 286)),
    height: Math.max(1, finite(panelSize?.height, 420)),
  };
  const safeGap = Math.max(0, finite(gap, DEFAULT_PANEL_GAP));
  const placed = [];
  let contentHeight = visibleViewport.height;

  panels.forEach((inputPanel, index) => {
    const panel = normalisePanel(inputPanel, fallbackSize, visibleViewport);
    let bounds = { ...visibleViewport, height: contentHeight, bottom: visibleViewport.y + contentHeight };
    let position = findAvailablePosition(panel, bounds, placed, safeGap);

    // With a finite number of panels, growing one panel-height at a time
    // always produces a free virtual row. The cap only protects malformed
    // zero-sized viewport inputs; it is not a position heuristic.
    let attempts = 0;
    while (!position && attempts <= panels.length) {
      contentHeight = nextContentHeight(bounds, panel, safeGap);
      bounds = { ...visibleViewport, height: contentHeight, bottom: visibleViewport.y + contentHeight };
      position = findAvailablePosition(panel, bounds, placed, safeGap);
      attempts += 1;
    }

    // A zero-sized viewport cannot host a meaningful panel. Keep the output
    // deterministic and report it as constrained instead of emitting NaN.
    const resolved = position || asCandidate(visibleViewport.x, visibleViewport.y, "unplaceable");
    placed.push({
      ...panel,
      id: panel.id ?? `panel-${index}`,
      x: resolved.x,
      y: resolved.y,
      placement: resolved.placement,
    });
  });

  const contentViewport = {
    ...visibleViewport,
    height: contentHeight,
    bottom: visibleViewport.y + contentHeight,
  };
  return {
    panels: placed,
    viewport: visibleViewport,
    contentHeight,
    contentViewport,
    requiresScroll: contentHeight > visibleViewport.height,
    validation: validatePanelLayout(placed, contentViewport, safeGap),
  };
};

/** Returns diagnostic information suitable for unit tests and development assertions. */
export const validatePanelLayout = (panels, viewport, gap = DEFAULT_PANEL_GAP) => {
  const bounds = normalizePanelViewport(viewport);
  const outside = panels.filter((panel) => !panelIsInside(panel, bounds)).map((panel) => panel.id);
  const overlaps = [];
  panels.forEach((panel, index) => panels.slice(index + 1).forEach((other) => {
    if (panelsOverlap(panel, other, gap)) overlaps.push([panel.id, other.id]);
  }));
  return { valid: outside.length === 0 && overlaps.length === 0, outside, overlaps };
};

/** Throws a useful error in development/tests when a host renders invalid positions. */
export const assertPanelLayout = (panels, viewport, gap = DEFAULT_PANEL_GAP) => {
  const result = validatePanelLayout(panels, viewport, gap);
  if (!result.valid) {
    throw new Error(`Invalid property-panel layout: outside=${result.outside.join(",") || "none"}; overlaps=${result.overlaps.map((pair) => pair.join("/")).join(",") || "none"}`);
  }
  return result;
};



























