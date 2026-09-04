import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { assertPanelLayout, DEFAULT_PANEL_GAP, panelLayoutManager } from "@/mindmap/panelLayout";

const FALLBACK_SIZES = {
  topic: { width: 286, height: 650 },
  image: { width: 286, height: 620 },
  relation: { width: 286, height: 470 },
  map: { width: 286, height: 470 },
};

const sameRect = (first, second) => first && second
  && Math.round(first.width) === Math.round(second.width)
  && Math.round(first.height) === Math.round(second.height);

const sameLayout = (first, second) => {
  if (!first || !second || first.contentHeight !== second.contentHeight || first.panels.length !== second.panels.length) return false;
  return first.panels.every((panel, index) => {
    const other = second.panels[index];
    return other && panel.id === other.id
      && panel.x === other.x && panel.y === other.y
      && panel.width === other.width && panel.height === other.height;
  });
};

const getPropertyPanelFallbackSize = (kind) => FALLBACK_SIZES[kind] || FALLBACK_SIZES.topic;

/**
 * A measured, overlay-local host for every property editor.  It deliberately
 * owns placement for all panel types so independent inspectors cannot fight
 * over CSS position/z-index rules.
 */
const PropertyPanelLayer = ({ containerRef, panels, getPreferredPosition, renderPanel, layoutVersion = 0 }) => {
  const panelElementsRef = useRef(new Map());
  const frameRef = useRef(null);
  const [measurements, setMeasurements] = useState({});
  const [layout, setLayout] = useState(null);
  const [layoutTick, setLayoutTick] = useState(0);

  const scheduleLayout = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setLayoutTick((value) => value + 1);
    });
  }, []);

  const readMeasurements = useCallback(() => {
    const next = {};
    panelElementsRef.current.forEach((element, id) => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) next[id] = { width: rect.width, height: rect.height };
    });
    setMeasurements((current) => {
      const ids = new Set([...Object.keys(current), ...Object.keys(next)]);
      const changed = [...ids].some((id) => !sameRect(current[id], next[id]));
      return changed ? next : current;
    });
  }, []);

  const registerPanel = useCallback((id, element) => {
    if (element) panelElementsRef.current.set(id, element);
    else panelElementsRef.current.delete(id);
    scheduleLayout();
  }, [scheduleLayout]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer = new ResizeObserver(() => {
      readMeasurements();
      scheduleLayout();
    });
    observer.observe(container);
    panelElementsRef.current.forEach((element) => observer.observe(element));
    readMeasurements();
    scheduleLayout();
    return () => observer.disconnect();
  }, [containerRef, panels, readMeasurements, scheduleLayout]);

  useEffect(() => {
    const onViewportChange = () => scheduleLayout();
    window.addEventListener("resize", onViewportChange);
    // Capturing scroll also covers an embedded/scrollable app shell.
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [scheduleLayout]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !panels.length) {
      return;
    }
    const canvasRect = container.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    const previousById = new Map((layout?.panels || []).map((panel) => [panel.id, panel]));
    const measuredPanels = panels.map((panel) => {
      const fallback = getPropertyPanelFallbackSize(panel.kind);
      const measured = measurements[panel.id] || fallback;
      const preferred = getPreferredPosition(panel, canvasRect, measured) || {};
      const previous = previousById.get(panel.id);
      const anchorChanged = previous && (Math.abs((previous.preferredX || 0) - (preferred.x || 0)) > 0.5
        || Math.abs((previous.preferredY || 0) - (preferred.y || 0)) > 0.5);
      return {
        ...panel,
        width: measured.width,
        height: measured.height,
        preferredX: preferred.x,
        preferredY: preferred.y,
        // A new panel must not move earlier panels.  Pan, zoom, resizing a
        // panel or moving its anchor is different: then recompute from the
        // fresh anchor so the editor stays next to the node it belongs to.
        ...(previous && !anchorChanged ? { x: previous.x, y: previous.y } : {}),
      };
    });
    const next = panelLayoutManager(measuredPanels, { x: 0, y: 0, width: canvasRect.width, height: canvasRect.height }, FALLBACK_SIZES.topic, DEFAULT_PANEL_GAP);
    if (import.meta.env.DEV) assertPanelLayout(next.panels, next.contentViewport, DEFAULT_PANEL_GAP);
    setLayout((current) => sameLayout(current, next) ? current : next);
  }, [containerRef, getPreferredPosition, layout, layoutTick, layoutVersion, measurements, panels]);

  if (!panels.length) return null;
  const placementById = new Map((layout?.panels || []).map((panel) => [panel.id, panel]));

  return (
    <div className={`property-panel-layer${layout?.requiresScroll ? " property-panel-layer--scroll" : ""}`} aria-live="polite">
      <div className="property-panel-content" style={{ minHeight: `${Math.max(layout?.contentHeight || 0, 100)}px` }}>
        {panels.map((panel) => {
          const fallback = getPropertyPanelFallbackSize(panel.kind);
          const placement = placementById.get(panel.id) || {
            x: DEFAULT_PANEL_GAP,
            y: DEFAULT_PANEL_GAP,
            width: fallback.width,
            height: fallback.height,
          };
          return (
            <div
              key={panel.id}
              ref={(element) => registerPanel(panel.id, element)}
              className="property-panel-slot"
              data-property-panel={panel.id}
              data-panel-kind={panel.kind}
              style={{ left: `${placement.x}px`, top: `${placement.y}px`, width: `${placement.width}px`, height: `${placement.height}px` }}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              {renderPanel(panel)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PropertyPanelLayer;
