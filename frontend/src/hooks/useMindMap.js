import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyNodeChanges } from "@xyflow/react";
import { BRANCH_COLORS, createInitialDocument, DOCUMENT_VERSION } from "@/mindmap/constants";
import { getImageNodeSize } from "@/mindmap/imageSizing";
import { autoLayout, buildEdges, canAcceptChildren, canReparent, getDescendantIds, getVisibleNodes, HORIZONTAL_GAP, TOPIC_NODE_WIDTH } from "@/mindmap/layout";
import { createFromTemplate, migrateDocument } from "@/mindmap/storage";
import { fetchMindMaps, removeMindMap, saveMindMap } from "@/mindmap/api";

const HISTORY_LIMIT = 80;

const cloneNodes = (nodes) => nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } }));

export const useMindMap = (user) => {
  const [initialState] = useState(() => {
    const initialDocuments = [createInitialDocument()];
    return { documents: initialDocuments, activeId: initialDocuments[0].id };
  });
  const [documents, setDocuments] = useState(initialState.documents);
  const [activeId, setActiveId] = useState(initialState.activeId);
  const [selectedIds, setSelectedIds] = useState(["root"]);
  const [focusId, setFocusId] = useState(null);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [saveStatus, setSaveStatus] = useState("saved");
  const [isLoaded, setIsLoaded] = useState(false);
  const clipboardRef = useRef(null);
  const layoutFrameRef = useRef(null);
  const mutationRevisionRef = useRef(0);
  // React Flow can emit many ResizeObserver-driven node changes in the same
  // frame. Keep the latest document synchronously available so one change
  // never computes a layout from an older render's closed-over document.
  const documentsRef = useRef(initialState.documents);
  const commitDocuments = useCallback((nextDocuments) => {
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
  }, []);

  useEffect(() => () => {
    if (layoutFrameRef.current !== null) window.cancelAnimationFrame(layoutFrameRef.current);
  }, []);

  const document = documents.find((item) => item.id === activeId) || documents[0];
  const nodes = useMemo(() => document?.nodes || [], [document]);
  const selectedNode = nodes.find((node) => node.id === selectedIds[0]) || null;

  useEffect(() => {
    let active = true;
    fetchMindMaps().then((result) => {
      if (!active) return;
      const rawDocuments = Array.isArray(result.documents) ? result.documents : [];
      const remoteDocuments = rawDocuments.map(migrateDocument);
      const nextDocuments = remoteDocuments.length ? remoteDocuments : [createInitialDocument()];
      commitDocuments(nextDocuments);
      setActiveId(nextDocuments[0].id);
      setSelectedIds([nextDocuments[0].nodes.find((node) => !node.data.parentId)?.id || "root"]);
      setHistory({ past: [], future: [] });
      setIsLoaded(true);
      const hasLayoutMigration = rawDocuments.some((item) => Number(item.version || 0) < DOCUMENT_VERSION);
      setSaveStatus(remoteDocuments.length && !hasLayoutMigration ? "saved" : "dirty");
    }).catch(() => {
      if (!active) return;
      setIsLoaded(true);
      // Do not autosave the local blank placeholder when the initial remote
      // load fails. A later user edit can still mark it dirty explicitly.
      setSaveStatus("load-error");
    });
    return () => { active = false; };
  }, [commitDocuments, user?.id]);

  const persistCurrentDocuments = useCallback(async () => {
    const revision = mutationRevisionRef.current;
    const snapshot = documentsRef.current;
    setSaveStatus("saving");
    try {
      await Promise.all(snapshot.map(saveMindMap));
      const isLatestRevision = mutationRevisionRef.current === revision;
      setSaveStatus(isLatestRevision ? "saved" : "dirty");
      return isLatestRevision;
    } catch {
      // Keep retrying the latest local snapshot. This covers a short backend
      // restart/deploy between a successful GridFS upload and the mind-map
      // document save without requiring another edit from the user.
      setSaveStatus(mutationRevisionRef.current === revision ? "error" : "dirty");
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || (saveStatus !== "dirty" && saveStatus !== "error")) return undefined;
    const timer = window.setTimeout(() => {
      persistCurrentDocuments();
    }, saveStatus === "error" ? 3_000 : 250);
    return () => window.clearTimeout(timer);
  }, [documents, isLoaded, persistCurrentDocuments, saveStatus]);

  const setDocument = useCallback((updater, { record = true } = {}) => {
    const currentDocument = documentsRef.current.find((item) => item.id === activeId);
    if (!currentDocument) return;
    const nextDocument = typeof updater === "function" ? updater(currentDocument) : updater;
    if (record) setHistory((current) => ({ past: [...current.past, currentDocument].slice(-HISTORY_LIMIT), future: [] }));
    mutationRevisionRef.current += 1;
    setSaveStatus("dirty");
    commitDocuments(documentsRef.current.map((item) =>
      item.id === activeId ? { ...nextDocument, updatedAt: new Date().toISOString() } : item
    ));
  }, [activeId, commitDocuments]);

  const updateNodes = useCallback((updater, { reflow = false, ...options } = {}) => {
    setDocument((current) => {
      const nextNodes = typeof updater === "function" ? updater(current.nodes) : updater;
      return {
        ...current,
        // Geometry changes get one tree-wide layout pass.  Aligning a single
        // chain after the layout can push it into the row below.
        nodes: reflow && current.layout === "horizontal" ? autoLayout(nextNodes, "horizontal") : nextNodes,
      };
    }, options);
  }, [setDocument]);

  const undo = useCallback(() => {
    const previous = history.past.at(-1);
    if (!previous) return;
    const currentDocument = documentsRef.current.find((item) => item.id === activeId) || document;
    setHistory((current) => ({
      past: current.past.slice(0, -1),
      future: [...current.future, currentDocument],
    }));
    commitDocuments(documentsRef.current.map((item) => (item.id === activeId ? previous : item)));
    mutationRevisionRef.current += 1;
    setSaveStatus("dirty");
  }, [activeId, commitDocuments, document, history.past]);

  const redo = useCallback(() => {
    const next = history.future.at(-1);
    if (!next) return;
    const currentDocument = documentsRef.current.find((item) => item.id === activeId) || document;
    setHistory((current) => ({
      past: [...current.past, currentDocument].slice(-HISTORY_LIMIT),
      future: current.future.slice(0, -1),
    }));
    commitDocuments(documentsRef.current.map((item) => (item.id === activeId ? next : item)));
    mutationRevisionRef.current += 1;
    setSaveStatus("dirty");
  }, [activeId, commitDocuments, document, history.future]);

  const addNode = useCallback((parentId, label = "") => {
    const parent = nodes.find((node) => node.id === parentId) || nodes[0];
    if (!parent) return;
    const siblingCount = nodes.filter((node) => node.data.parentId === parent.id).length;
    const id = crypto.randomUUID();
    const branchColor = parent.data.parentId
      ? parent.data.branchColor
      : BRANCH_COLORS[siblingCount % BRANCH_COLORS.length];
    const node = {
      id,
      type: "topic",
      position: { x: parent.position.x + HORIZONTAL_GAP, y: parent.position.y + siblingCount * 130 },
      data: {
        label,
        parentId: parent.id,
        color: "#ffffff",
        textColor: "#172033",
        borderColor: "#dbe4f0",
        branchColor,
        fontSize: 15,
        fontWeight: 600,
        note: "",
        link: "",
        emoji: "",
        checked: false,
        collapsed: false,
        hidden: false,
        labels: [],
        dueDate: "",
        relationStyle: "inherit",
        layout: "inherit",
        imageAssetId: null,
        topicImageHeight: 0,
        imagePosition: "above",
      },
    };
    updateNodes((current) => [...current, node], { reflow: true });
    setSelectedIds([id]);
    return id;
  }, [nodes, updateNodes]);

  const addSibling = useCallback(() => {
    if (!selectedNode) return;
    addNode(selectedNode.data.parentId || selectedNode.id);
  }, [addNode, selectedNode]);

  const addRootNode = useCallback(() => {
    const roots = nodes.filter((node) => node.type === "topic" && !node.data.parentId);
    const id = crypto.randomUUID();
    const node = {
      id, type: "topic", position: { x: 180 + roots.length * 430, y: 160 },
      data: {
        label: "Ý tưởng trung tâm", parentId: null, color: "#172554", textColor: "#ffffff",
        borderColor: "#2563eb", branchColor: BRANCH_COLORS[roots.length % BRANCH_COLORS.length],
        fontSize: 18, fontWeight: 700, note: "", link: "", emoji: "💡", checked: false,
        collapsed: false, hidden: false, labels: [], dueDate: "", relationStyle: "inherit",
        layout: "inherit", imageAssetId: null, topicImageHeight: 0, imagePosition: "above",
      },
    };
    updateNodes((current) => [...current, node], { reflow: true });
    setSelectedIds([id]);
    return id;
  }, [nodes, updateNodes]);

  const deleteSelected = useCallback(() => {
    if (!selectedNode || (selectedNode.type !== "image" && !selectedNode.data.parentId)) return;
    const ids = getDescendantIds(nodes, selectedNode.id);
    ids.add(selectedNode.id);
    setDocument((current) => {
      const remainingNodes = current.nodes.filter((node) => !ids.has(node.id));
      const validRelations = new Set(remainingNodes.filter((node) => node.data.parentId).map((node) => `${node.data.parentId}-${node.id}`));
      return {
        ...current,
        nodes: current.layout === "horizontal" ? autoLayout(remainingNodes, "horizontal") : remainingNodes,
        crossLinks: current.crossLinks.filter((link) => !ids.has(link.source) && !ids.has(link.target)),
        relations: Object.fromEntries(Object.entries(current.relations).filter(([id]) => validRelations.has(id))),
      };
    });
    setSelectedIds(selectedNode.data.parentId ? [selectedNode.data.parentId] : []);
  }, [nodes, selectedNode, setDocument]);

  const updateSelected = useCallback((updates) => {
    if (!selectedNode) return;
    updateNodes((current) => current.map((node) =>
      node.id === selectedNode.id ? { ...node, data: { ...node.data, ...updates } } : node
    ));
  }, [selectedNode, updateNodes]);

  const duplicateSelected = useCallback(() => {
    if (!selectedNode) return;
    const idMap = new Map();
    const branchIds = getDescendantIds(nodes, selectedNode.id);
    branchIds.add(selectedNode.id);
    const branch = nodes.filter((node) => branchIds.has(node.id));
    branch.forEach((node) => idMap.set(node.id, crypto.randomUUID()));
    const copies = branch.map((node) => ({
      ...node,
      id: idMap.get(node.id),
      position: { x: node.position.x + 36, y: node.position.y + 72 },
      data: {
        ...node.data,
        ...(node.type === "topic" ? { label: node.id === selectedNode.id ? `${node.data.label} (bản sao)` : node.data.label } : {}),
        parentId: idMap.get(node.data.parentId) || node.data.parentId,
      },
    }));
    updateNodes((current) => [...current, ...copies], { reflow: true });
    setSelectedIds([idMap.get(selectedNode.id)]);
  }, [nodes, selectedNode, updateNodes]);

  const copy = useCallback(() => {
    if (!selectedNode) return;
    const ids = getDescendantIds(nodes, selectedNode.id);
    ids.add(selectedNode.id);
    clipboardRef.current = {
      rootId: selectedNode.id,
      nodes: nodes.filter((node) => ids.has(node.id)).map((node) => ({ ...node, data: { ...node.data }, position: { ...node.position } })),
      crossLinks: document.crossLinks.filter((link) => ids.has(link.source) && ids.has(link.target)),
    };
  }, [document.crossLinks, nodes, selectedNode]);

  const cut = useCallback(() => {
    copy();
    deleteSelected();
  }, [copy, deleteSelected]);

  const paste = useCallback(() => {
    if (!clipboardRef.current || !selectedNode) return;
    const payload = clipboardRef.current;
    const idMap = new Map(payload.nodes.map((node) => [node.id, crypto.randomUUID()]));
    const copies = payload.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id),
      position: { x: node.position.x + 50, y: node.position.y + 60 },
      data: {
        ...node.data,
        label: node.id === payload.rootId && node.type !== "image" ? `${node.data.label} (copy)` : node.data.label,
        parentId: node.id === payload.rootId ? selectedNode.id : idMap.get(node.data.parentId) || node.data.parentId,
      },
    }));
    setDocument((current) => {
      const nextNodes = [...current.nodes, ...copies];
      return {
        ...current,
        nodes: current.layout === "horizontal" ? autoLayout(nextNodes, "horizontal") : nextNodes,
        crossLinks: [...current.crossLinks, ...payload.crossLinks.map((link) => ({ ...link, id: crypto.randomUUID(), source: idMap.get(link.source), target: idMap.get(link.target) }))],
      };
    });
    setSelectedIds([idMap.get(payload.rootId)]);
  }, [selectedNode, setDocument]);

  const addImageNode = useCallback((asset, position, parentId = null, siblingOffset = 0) => {
    const { width, height } = getImageNodeSize(asset.width, asset.height);
    const parent = nodes.find((node) => node.id === parentId);
    const siblingCount = nodes.filter((node) => node.data.parentId === parentId).length + siblingOffset;
    const parentWidth = parent?.type === "image" ? Number(parent.style?.width || 260) : TOPIC_NODE_WIDTH;
    const parentHeight = Number(parent?.style?.height || (parent?.type === "image" ? 160 : 76));
    const parentAnchorY = parent ? parent.position.y + parentHeight / 2 : position.y + 38;
    const connectedPosition = parent ? {
      x: parent.position.x + parentWidth + 120,
      y: parentAnchorY - 38 + siblingCount * (Math.min(height, 240) + 44),
    } : position;
    const id = crypto.randomUUID();
    updateNodes((current) => [...current, {
      id,
      type: "image",
      position: connectedPosition,
      style: { width, height },
      data: {
        assetId: asset.id, assetName: asset.name, naturalWidth: asset.width, naturalHeight: asset.height,
        customSize: false, caption: "", note: "", rotation: 0, locked: false, collapsed: false,
        zIndex: 1, link: "", parentId: parent?.id || null,
        branchColor: parent?.data.branchColor || "#2563eb", relationStyle: "inherit", layout: "inherit",
      },
    }], { reflow: true });
    setSelectedIds([id]);
    return id;
  }, [nodes, updateNodes]);

  const attachImage = useCallback((nodeId, asset) => {
    const topicImageHeight = Math.min(145, Math.max(36, (Number(asset.height) / Math.max(1, Number(asset.width))) * 228));
    updateNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: { ...node.data, imageAssetId: asset.id, topicImageHeight },
    } : node), { reflow: true });
    setSelectedIds([nodeId]);
  }, [updateNodes]);

  const updateRelation = useCallback((relationId, updates, options) => {
    setDocument((current) => {
      const crossLinkIndex = current.crossLinks.findIndex((link) => link.id === relationId);
      if (crossLinkIndex >= 0) {
        return { ...current, crossLinks: current.crossLinks.map((link) => link.id === relationId ? { ...link, ...updates } : link) };
      }
      return { ...current, relations: { ...current.relations, [relationId]: { ...current.relations[relationId], ...updates } } };
    }, options);
  }, [setDocument]);

  const addCrossLink = useCallback((source, target) => {
    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);
    const isTreeRelation = sourceNode?.data.parentId === target || targetNode?.data.parentId === source;
    const alreadyLinked = document.crossLinks.some((link) =>
      (link.source === source && link.target === target) || (link.source === target && link.target === source)
    );
    if (!source || !target || source === target || isTreeRelation || alreadyLinked) return null;
    const id = `cross-${crypto.randomUUID()}`;
    setDocument((current) => ({ ...current, crossLinks: [...current.crossLinks, { id, source, target, style: "straight", color: "#8b5cf6", width: 2, opacity: 0.9, dash: "solid", label: "" }] }));
    return id;
  }, [document.crossLinks, nodes, setDocument]);

  const deleteCrossLink = useCallback((id) => {
    setDocument((current) => ({ ...current, crossLinks: current.crossLinks.filter((link) => link.id !== id) }));
  }, [setDocument]);

  const reparentNode = useCallback((nodeId, parentId) => {
    if (!canReparent(nodes, nodeId, parentId)) return false;
    const movingNode = nodes.find((node) => node.id === nodeId);
    const parent = nodes.find((node) => node.id === parentId);
    // The central topic stays a root. Every other topic/image can be dropped
    // onto either a topic or an image, so an image can own a normal subtree.
    if (!movingNode || (movingNode.type === "topic" && !movingNode.data.parentId) || !canAcceptChildren(parent)) return false;
    setDocument((current) => {
      const latestMoving = current.nodes.find((node) => node.id === nodeId);
      const latestParent = current.nodes.find((node) => node.id === parentId);
      if (!latestMoving || !canAcceptChildren(latestParent) || !canReparent(current.nodes, nodeId, parentId)) return current;
      const connected = current.nodes.map((node) => node.id === nodeId
        ? { ...node, data: { ...node.data, parentId, branchColor: latestParent.data.branchColor } }
        : node);
      // Rebuild the whole tree atomically so a moved branch cannot enter the
      // visual row reserved for its neighbour.
      return { ...current, layout: "horizontal", nodes: autoLayout(connected, "horizontal") };
    });
    return true;
  }, [nodes, setDocument]);

  const moveSubtree = useCallback((nodeId, rootPosition, initialPositions) => {
    const origin = initialPositions.get(nodeId);
    if (!origin) return;
    const descendants = getDescendantIds(nodes, nodeId);
    const dx = rootPosition.x - origin.x;
    const dy = rootPosition.y - origin.y;
    updateNodes((current) => current.map((node) => {
      if (node.id === nodeId) return { ...node, position: rootPosition };
      const initial = initialPositions.get(node.id);
      return descendants.has(node.id) && initial ? { ...node, position: { x: initial.x + dx, y: initial.y + dy } } : node;
    }), { record: false });
  }, [nodes, updateNodes]);

  const arrange = useCallback((layout = document.layout) => {
    setDocument((current) => {
      const arranged = autoLayout(current.nodes, layout);
      return { ...current, layout, nodes: arranged };
    });
  }, [document.layout, setDocument]);

  const onNodesChange = useCallback((changes) => {
    const hasGeometryChange = changes.some((change) => change.type === "dimensions"
      && (Number.isFinite(change.dimensions?.width) || Number.isFinite(change.dimensions?.height)));
    // Keep every measured dimension, then batch exactly one layout pass for
    // the frame. ResizeObserver commonly emits one event per node; reflowing
    // during each event used to create jitter and could discard a sibling's
    // freshly measured height.
    updateNodes((current) => applyNodeChanges(changes, current), { record: false });
    if (hasGeometryChange && layoutFrameRef.current === null) {
      layoutFrameRef.current = window.requestAnimationFrame(() => {
        layoutFrameRef.current = null;
        updateNodes((current) => current, { record: false, reflow: true });
      });
    }
    const selection = changes.filter((change) => change.type === "select" && change.selected).map((change) => change.id);
    if (selection.length) setSelectedIds(selection);
  }, [updateNodes]);

  const recordDrag = useCallback(() => {
    setHistory((current) => ({
      past: [...current.past, { ...document, nodes: cloneNodes(nodes) }].slice(-HISTORY_LIMIT),
      future: [],
    }));
  }, [document, nodes]);

  const createDocument = useCallback((templateId = "blank") => {
    const next = createFromTemplate(templateId);
    commitDocuments([...documentsRef.current, next]);
    setActiveId(next.id);
    setSelectedIds(["root"]);
    setHistory({ past: [], future: [] });
    mutationRevisionRef.current += 1;
    setSaveStatus("dirty");
  }, [commitDocuments]);

  const deleteDocument = useCallback((id) => {
    if (documents.length === 1) return;
    const next = documentsRef.current.filter((item) => item.id !== id);
    if (id === activeId) setActiveId(next[0].id);
    commitDocuments(next);
    mutationRevisionRef.current += 1;
    setSaveStatus("dirty");
    removeMindMap(id).catch(() => setSaveStatus("error"));
  }, [activeId, commitDocuments, documents.length]);

  const importDocument = useCallback((next) => {
    commitDocuments([...documentsRef.current, next]);
    setActiveId(next.id);
    setSelectedIds([next.nodes.find((node) => !node.data.parentId)?.id]);
    setHistory({ past: [], future: [] });
    mutationRevisionRef.current += 1;
    setSaveStatus("dirty");
  }, [commitDocuments]);

  const openDocument = useCallback((id) => {
    const next = documents.find((item) => item.id === id);
    if (!next) return;
    setActiveId(id);
    setSelectedIds([next.nodes.find((node) => node.type === "topic" && !node.data.parentId)?.id].filter(Boolean));
    setFocusId(null);
    setHistory({ past: [], future: [] });
  }, [documents]);

  const saveNow = useCallback(() => persistCurrentDocuments(), [persistCurrentDocuments]);

  const visibleNodes = useMemo(() => getVisibleNodes(nodes, focusId), [focusId, nodes]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const edges = useMemo(() => buildEdges(nodes, document.settings, document.relations, document.crossLinks).filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)), [document.crossLinks, document.relations, document.settings, nodes, visibleIds]);

  return {
    documents, document, nodes: visibleNodes, allNodes: nodes, edges, selectedNode,
    selectedIds, setSelectedIds, setActiveId: openDocument, focusId, setFocusId,
    setDocument, updateSelected, onNodesChange, recordDrag,
    addNode, addSibling, addRootNode, deleteSelected, duplicateSelected, addImageNode, attachImage,
    updateRelation, addCrossLink, deleteCrossLink, reparentNode, moveSubtree,
    copy, cut, paste, undo, redo, arrange,
    createDocument, deleteDocument, importDocument, saveNow, saveStatus,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
};
