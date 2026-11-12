import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyNodeChanges } from "@xyflow/react";
import { createInitialDocument, createTopicData, DOCUMENT_VERSION } from "@/mindmap/constants";
import { getImageNodeSize } from "@/mindmap/imageSizing";
import {
  autoLayout, buildEdges, canAcceptChildren, canReparent, computeBranchModes, getDescendantIds, getNodeSize,
  getVisibleNodes, isAutoLayout,
} from "@/mindmap/layout";
import { createFromTemplate, migrateDocument } from "@/mindmap/storage";
import { resolveNodeStyles } from "@/mindmap/styles";
import { nodesFromTree } from "@/mindmap/formats";
import { fetchMindMaps, removeMindMap, saveMindMap } from "@/mindmap/api";

const HISTORY_LIMIT = 100;
const STYLE_FIELDS = ["color", "textColor", "borderColor", "borderWidth", "shape", "fontSize", "fontWeight", "fontStyle", "textAlign", "maxWidth", "branchColor"];

const cloneNodes = (nodes) => nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data } }));
const firstRootId = (document) => document?.nodes.find((node) => node.type === "topic" && !node.data.parentId)?.id;
const isLive = (document) => !document.trashedAt;

/** Re-runs the auto layout after any change that can move or resize topics. */
const relayout = (document, nodes) => (isAutoLayout(document.layout)
  ? autoLayout(nodes, document.layout, { spacing: document.settings?.spacing })
  : nodes);

const copyBranch = (nodes, rootId) => {
  const ids = getDescendantIds(nodes, rootId);
  ids.add(rootId);
  return nodes.filter((node) => ids.has(node.id));
};

const branchToText = (nodes, rootId) => {
  const lines = [];
  const visit = (id, depth) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    if (node.type === "topic") lines.push(`${"\t".repeat(depth)}${String(node.data.label || "").replace(/\n/g, " ")}`);
    nodes.filter((item) => item.data.parentId === id).forEach((child) => visit(child.id, depth + 1));
  };
  visit(rootId, 0);
  return lines.join("\n");
};

export const duplicateMapDocument = (document) => {
  const idMap = new Map(document.nodes.map((node) => [node.id, node.id === "root" ? "root" : crypto.randomUUID()]));
  const mapId = (id) => idMap.get(id) || id;
  return {
    ...structuredClone(document),
    id: crypto.randomUUID(),
    title: `${document.title} (bản sao)`,
    favorite: false,
    trashedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: document.nodes.map((node) => ({ ...structuredClone(node), id: mapId(node.id), data: { ...structuredClone(node.data), parentId: node.data.parentId ? mapId(node.data.parentId) : null } })),
    crossLinks: document.crossLinks.map((link) => ({ ...link, id: `cross-${crypto.randomUUID()}`, source: mapId(link.source), target: mapId(link.target) })),
    relations: Object.fromEntries(document.nodes
      .filter((node) => node.data.parentId && document.relations[`${node.data.parentId}-${node.id}`])
      .map((node) => [`${mapId(node.data.parentId)}-${mapId(node.id)}`, structuredClone(document.relations[`${node.data.parentId}-${node.id}`])])),
  };
};

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
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const clipboardRef = useRef(null);
  const layoutFrameRef = useRef(null);
  // Only maps that actually changed are sent to the server.
  const dirtyRef = useRef(new Map());
  const documentsRef = useRef(initialState.documents);
  const activeIdRef = useRef(initialState.activeId);

  const commitDocuments = useCallback((nextDocuments) => {
    documentsRef.current = nextDocuments;
    setDocuments(nextDocuments);
  }, []);

  const markDirty = useCallback((id) => {
    dirtyRef.current.set(id, (dirtyRef.current.get(id) || 0) + 1);
    setSaveStatus("dirty");
  }, []);

  const activate = useCallback((id) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  useEffect(() => () => {
    if (layoutFrameRef.current !== null) window.cancelAnimationFrame(layoutFrameRef.current);
  }, []);

  const document = documents.find((item) => item.id === activeId) || documents[0];
  const nodes = useMemo(() => document?.nodes || [], [document]);
  const selectedNode = nodes.find((node) => node.id === selectedIds[0]) || null;

  const loadRemote = useCallback(async () => {
    try {
      const result = await fetchMindMaps();
      const rawDocuments = Array.isArray(result?.documents) ? result.documents : [];
      const remoteDocuments = rawDocuments.map(migrateDocument);
      const live = remoteDocuments.filter(isLive);
      const nextDocuments = live.length ? remoteDocuments : [createInitialDocument(), ...remoteDocuments];
      commitDocuments(nextDocuments);
      const first = nextDocuments.find(isLive);
      activate(first.id);
      setSelectedIds([firstRootId(first) || "root"].filter(Boolean));
      setHistory({ past: [], future: [] });
      dirtyRef.current = new Map();
      // Migrated maps and a brand-new first map are saved right away.
      rawDocuments.forEach((item) => { if (Number(item.version || 0) < DOCUMENT_VERSION) dirtyRef.current.set(item.id, 1); });
      if (!live.length) dirtyRef.current.set(first.id, 1);
      setSaveStatus(dirtyRef.current.size ? "dirty" : "saved");
      setIsLoaded(true);
    } catch {
      setIsLoaded(true);
      // Never autosave the local blank placeholder over data we could not load.
      setSaveStatus("load-error");
    }
  }, [activate, commitDocuments]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadRemote(); });
    return () => { active = false; };
  }, [loadRemote, user?.id]);

  const persistDirtyDocuments = useCallback(async () => {
    const pending = [...dirtyRef.current.entries()];
    if (!pending.length) { setSaveStatus("saved"); return true; }
    setSaveStatus("saving");
    const results = await Promise.allSettled(pending.map(async ([id, revision]) => {
      const snapshot = documentsRef.current.find((item) => item.id === id);
      if (snapshot) await saveMindMap(snapshot);
      if (dirtyRef.current.get(id) === revision) dirtyRef.current.delete(id);
    }));
    const failed = results.some((result) => result.status === "rejected");
    if (!failed) setLastSavedAt(new Date());
    setSaveStatus(failed ? "error" : dirtyRef.current.size ? "dirty" : "saved");
    return !failed && dirtyRef.current.size === 0;
  }, []);

  useEffect(() => {
    if (!isLoaded || (saveStatus !== "dirty" && saveStatus !== "error")) return undefined;
    // Retry failed saves; keep typing smooth with a short debounce.
    const timer = window.setTimeout(() => { void persistDirtyDocuments(); }, saveStatus === "error" ? 4_000 : 450);
    return () => window.clearTimeout(timer);
  }, [documents, isLoaded, persistDirtyDocuments, saveStatus]);

  useEffect(() => {
    const warn = (event) => {
      if (!dirtyRef.current.size) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /** Updates any map (not only the active one) without touching undo history. */
  const updateDocumentById = useCallback((id, updater) => {
    const current = documentsRef.current.find((item) => item.id === id);
    if (!current) return;
    const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
    commitDocuments(documentsRef.current.map((item) => (item.id === id ? { ...next, updatedAt: new Date().toISOString() } : item)));
    markDirty(id);
  }, [commitDocuments, markDirty]);

  const setDocument = useCallback((updater, { record = true } = {}) => {
    const id = activeIdRef.current;
    const currentDocument = documentsRef.current.find((item) => item.id === id);
    if (!currentDocument) return;
    const nextDocument = typeof updater === "function" ? updater(currentDocument) : updater;
    if (nextDocument === currentDocument) return;
    if (record) setHistory((current) => ({ past: [...current.past, currentDocument].slice(-HISTORY_LIMIT), future: [] }));
    commitDocuments(documentsRef.current.map((item) => (item.id === id ? { ...nextDocument, updatedAt: new Date().toISOString() } : item)));
    markDirty(id);
  }, [commitDocuments, markDirty]);

  const updateNodes = useCallback((updater, { reflow = false, ...options } = {}) => {
    setDocument((current) => {
      const nextNodes = typeof updater === "function" ? updater(current.nodes) : updater;
      return { ...current, nodes: reflow ? relayout(current, nextNodes) : nextNodes };
    }, options);
  }, [setDocument]);

  const restoreSnapshot = useCallback((target, from, to) => {
    const id = activeIdRef.current;
    const currentDocument = documentsRef.current.find((item) => item.id === id);
    if (!target || !currentDocument) return;
    setHistory((current) => ({ [from]: current[from].slice(0, -1), [to]: [...current[to], currentDocument].slice(-HISTORY_LIMIT) }));
    commitDocuments(documentsRef.current.map((item) => (item.id === id ? target : item)));
    markDirty(id);
  }, [commitDocuments, markDirty]);

  const undo = useCallback(() => restoreSnapshot(history.past.at(-1), "past", "future"), [history.past, restoreSnapshot]);
  const redo = useCallback(() => restoreSnapshot(history.future.at(-1), "future", "past"), [history.future, restoreSnapshot]);

  // -------------------------------------------------------------- topics --

  const addNode = useCallback((parentId, label = "", options = {}) => {
    const parent = nodes.find((node) => node.id === parentId) || nodes.find((node) => !node.data.parentId) || nodes[0];
    if (!parent) return null;
    const id = crypto.randomUUID();
    const parentSize = getNodeSize(parent);
    const siblings = nodes.filter((node) => node.data.parentId === parent.id).length;
    const node = {
      id,
      type: "topic",
      position: { x: parent.position.x + parentSize.width + 80, y: parent.position.y + siblings * 48 },
      data: createTopicData({
        label,
        ...(options.data || {}),
        // Tree ownership always comes from the real parent.
        parentId: parent.id,
      }),
    };
    updateNodes((current) => {
      if (options.index === undefined) return [...current, node];
      const next = [...current];
      next.splice(options.index, 0, node);
      return next;
    }, { reflow: true });
    if (options.select !== false) setSelectedIds([id]);
    return id;
  }, [nodes, updateNodes]);

  /** Adds a sibling right after (or before) the selected topic. */
  const addSibling = useCallback((before = false) => {
    if (!selectedNode) return null;
    if (!selectedNode.data.parentId) return addNode(selectedNode.id);
    const index = nodes.findIndex((node) => node.id === selectedNode.id);
    return addNode(selectedNode.data.parentId, "", { index: before ? index : index + 1, data: selectedNode.data.side ? { side: selectedNode.data.side } : {} });
  }, [addNode, nodes, selectedNode]);

  const addRootNode = useCallback((position) => {
    const roots = nodes.filter((node) => !node.data.parentId);
    const lowest = Math.max(0, ...nodes.map((node) => node.position.y + getNodeSize(node).height));
    const id = crypto.randomUUID();
    const node = {
      id, type: "topic",
      position: position || { x: roots[0]?.position.x || 0, y: lowest + 160 },
      data: createTopicData({ label: "Chủ đề trung tâm" }),
    };
    updateNodes((current) => [...current, node], { reflow: true });
    setSelectedIds([id]);
    return id;
  }, [nodes, updateNodes]);

  const removeNodes = useCallback((ids, { keepChildren = false } = {}) => {
    setDocument((current) => {
      const removed = new Set();
      ids.forEach((id) => {
        const target = current.nodes.find((node) => node.id === id);
        // Keep at least the central topic of the map.
        if (!target || (target.type === "topic" && !target.data.parentId && current.nodes.filter((node) => !node.data.parentId && node.type === "topic").length <= 1)) return;
        removed.add(id);
        if (!keepChildren) getDescendantIds(current.nodes, id).forEach((descendant) => removed.add(descendant));
      });
      if (!removed.size) return current;
      const remaining = current.nodes.filter((node) => !removed.has(node.id)).map((node) => {
        if (!keepChildren || !removed.has(node.data.parentId)) return node;
        let parentId = node.data.parentId;
        while (removed.has(parentId)) parentId = current.nodes.find((item) => item.id === parentId)?.data.parentId || null;
        return { ...node, data: { ...node.data, parentId, side: "" } };
      });
      const validRelations = new Set(remaining.filter((node) => node.data.parentId).map((node) => `${node.data.parentId}-${node.id}`));
      return {
        ...current,
        nodes: relayout(current, remaining),
        crossLinks: current.crossLinks.filter((link) => !removed.has(link.source) && !removed.has(link.target)),
        relations: Object.fromEntries(Object.entries(current.relations).filter(([id]) => validRelations.has(id))),
      };
    });
  }, [setDocument]);

  const deleteSelected = useCallback((options) => {
    const targets = selectedIds.filter((id) => nodes.some((node) => node.id === id));
    if (!targets.length) return;
    const fallback = nodes.find((node) => node.id === targets[0])?.data.parentId;
    removeNodes(targets, options);
    setSelectedIds(fallback ? [fallback] : []);
  }, [nodes, removeNodes, selectedIds]);

  const updateNodesData = useCallback((ids, updates, { record = true } = {}) => {
    const idSet = new Set(ids);
    const geometry = ["label", "fontSize", "fontWeight", "imageAssetId", "topicImageHeight", "layout", "collapsed", "hidden", "rotation", "shape", "maxWidth", "icon", "emoji", "checkbox", "labels", "dueDate", "note", "side", "borderWidth"]
      .some((key) => key in updates);
    updateNodes((current) => current.map((node) => (idSet.has(node.id) ? { ...node, data: { ...node.data, ...updates } } : node)), { reflow: geometry, record });
  }, [updateNodes]);

  /** Data and React Flow style (width/height) of one node, e.g. an image. */
  const updateNodeStyle = useCallback((id, dataUpdates = {}, styleUpdates = null) => {
    updateNodes((current) => current.map((node) => (node.id === id ? {
      ...node,
      ...(styleUpdates ? { style: { ...node.style, ...styleUpdates } } : {}),
      data: { ...node.data, ...dataUpdates },
    } : node)), { reflow: true });
  }, [updateNodes]);

  const updateSelected = useCallback((updates) => {
    if (selectedNode) updateNodesData([selectedNode.id], updates);
  }, [selectedNode, updateNodesData]);

  const resetStyle = useCallback((ids) => {
    updateNodesData(ids, Object.fromEntries(STYLE_FIELDS.map((field) => [field, ["borderWidth", "fontSize", "fontWeight", "maxWidth"].includes(field) ? null : ""])));
  }, [updateNodesData]);

  const copyStyle = useCallback((id) => {
    const node = nodes.find((item) => item.id === id);
    if (node) clipboardRef.current = { ...clipboardRef.current, style: Object.fromEntries(STYLE_FIELDS.map((field) => [field, node.data[field]])) };
  }, [nodes]);

  const pasteStyle = useCallback((ids) => {
    const style = clipboardRef.current?.style;
    if (style) updateNodesData(ids, style);
    return Boolean(style);
  }, [updateNodesData]);

  const duplicateSelected = useCallback((nodeId) => {
    const source = nodes.find((node) => node.id === (typeof nodeId === "string" ? nodeId : selectedNode?.id));
    if (!source) return;
    const branch = copyBranch(nodes, source.id);
    const idMap = new Map(branch.map((node) => [node.id, crypto.randomUUID()]));
    const copies = branch.map((node) => ({
      ...node,
      id: idMap.get(node.id),
      position: { x: node.position.x + 30, y: node.position.y + 60 },
      data: {
        ...node.data,
        ...(node.type === "topic" && node.id === source.id ? { label: `${node.data.label} (bản sao)` } : {}),
        parentId: idMap.get(node.data.parentId) || node.data.parentId,
      },
    }));
    const index = nodes.findIndex((node) => node.id === source.id);
    updateNodes((current) => {
      const next = [...current];
      next.splice(index + 1, 0, ...copies);
      return next;
    }, { reflow: true });
    setSelectedIds([idMap.get(source.id)]);
  }, [nodes, selectedNode, updateNodes]);

  /** Copies the selected branch; returns it as indented text for the system clipboard. */
  const copy = useCallback(() => {
    if (!selectedNode) return "";
    const branch = copyBranch(nodes, selectedNode.id);
    const ids = new Set(branch.map((node) => node.id));
    const text = branchToText(nodes, selectedNode.id);
    clipboardRef.current = {
      ...clipboardRef.current,
      rootId: selectedNode.id,
      nodes: cloneNodes(branch),
      crossLinks: document.crossLinks.filter((link) => ids.has(link.source) && ids.has(link.target)),
      text,
    };
    return text;
  }, [document.crossLinks, nodes, selectedNode]);

  const cut = useCallback(() => {
    const text = copy();
    deleteSelected();
    return text;
  }, [copy, deleteSelected]);

  const hasClipboardBranch = useCallback((text) => Boolean(clipboardRef.current?.nodes?.length)
    && (text === undefined || String(text).trim() === String(clipboardRef.current.text || "").trim()), []);

  const paste = useCallback(() => {
    const payload = clipboardRef.current;
    const target = selectedNode || nodes.find((node) => !node.data.parentId);
    if (!payload?.nodes?.length || !target) return false;
    const idMap = new Map(payload.nodes.map((node) => [node.id, crypto.randomUUID()]));
    const copies = payload.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id),
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data, parentId: node.id === payload.rootId ? target.id : idMap.get(node.data.parentId) || node.data.parentId, side: node.id === payload.rootId ? "" : node.data.side },
    }));
    setDocument((current) => ({
      ...current,
      nodes: relayout(current, [...current.nodes, ...copies]),
      crossLinks: [...current.crossLinks, ...payload.crossLinks.map((link) => ({ ...link, id: `cross-${crypto.randomUUID()}`, source: idMap.get(link.source), target: idMap.get(link.target) }))],
    }));
    setSelectedIds([idMap.get(payload.rootId)]);
    return true;
  }, [nodes, selectedNode, setDocument]);

  /** Adds a parsed outline (brainstorm, pasted text) under a topic. */
  const addTree = useCallback((parentId, tree) => {
    const parent = nodes.find((node) => node.id === parentId) || nodes.find((node) => !node.data.parentId);
    if (!parent || !tree.length) return [];
    const created = nodesFromTree(tree, parent.id).map((node, index) => ({ ...node, position: { x: parent.position.x + 200, y: parent.position.y + index * 40 } }));
    updateNodes((current) => [...current, ...created], { reflow: true });
    const firstLevel = created.filter((node) => node.data.parentId === parent.id).map((node) => node.id);
    setSelectedIds(firstLevel.slice(0, 1));
    return created;
  }, [nodes, updateNodes]);

  const sortChildren = useCallback((parentId, direction = "asc") => {
    setDocument((current) => {
      const children = current.nodes.filter((node) => node.data.parentId === parentId);
      if (children.length < 2) return current;
      const sorted = [...children].sort((a, b) => String(a.data.label || a.data.caption || "").localeCompare(String(b.data.label || b.data.caption || ""), "vi", { numeric: true, sensitivity: "base" }) * (direction === "desc" ? -1 : 1));
      let cursor = 0;
      const nextNodes = current.nodes.map((node) => (node.data.parentId === parentId ? sorted[cursor++] : node));
      return { ...current, nodes: relayout(current, nextNodes) };
    });
  }, [setDocument]);

  const addImageNode = useCallback((asset, position, parentId = null) => {
    const { width, height } = getImageNodeSize(asset.width, asset.height);
    const parent = nodes.find((node) => node.id === parentId);
    const id = crypto.randomUUID();
    updateNodes((current) => [...current, {
      id,
      type: "image",
      position: parent ? { x: parent.position.x + getNodeSize(parent).width + 80, y: parent.position.y } : position,
      style: { width, height },
      data: {
        assetId: asset.id, assetName: asset.name, naturalWidth: asset.width, naturalHeight: asset.height,
        customSize: false, caption: "", note: "", rotation: 0, locked: false, collapsed: false,
        zIndex: 1, link: "", parentId: parent?.id || null, branchColor: "", side: "", relationStyle: "inherit", layout: "inherit",
      },
    }], { reflow: true });
    setSelectedIds([id]);
    return id;
  }, [nodes, updateNodes]);

  const attachImage = useCallback((nodeId, asset) => {
    const topicImageHeight = Math.min(145, Math.max(36, (Number(asset.height) / Math.max(1, Number(asset.width))) * 228));
    updateNodesData([nodeId], { imageAssetId: asset.id, topicImageHeight });
    setSelectedIds([nodeId]);
  }, [updateNodesData]);

  const updateRelation = useCallback((relationId, updates, options) => {
    setDocument((current) => {
      if (current.crossLinks.some((link) => link.id === relationId)) {
        return { ...current, crossLinks: current.crossLinks.map((link) => (link.id === relationId ? { ...link, ...updates } : link)) };
      }
      return { ...current, relations: { ...current.relations, [relationId]: { ...current.relations[relationId], ...updates } } };
    }, options);
  }, [setDocument]);

  const addCrossLink = useCallback((source, target) => {
    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);
    const isTreeRelation = sourceNode?.data.parentId === target || targetNode?.data.parentId === source;
    const alreadyLinked = document.crossLinks.some((link) => (link.source === source && link.target === target) || (link.source === target && link.target === source));
    if (!source || !target || source === target || isTreeRelation || alreadyLinked) return null;
    const id = `cross-${crypto.randomUUID()}`;
    setDocument((current) => ({ ...current, crossLinks: [...current.crossLinks, { id, source, target, style: "curved", dash: "dashed", arrow: "end", label: "" }] }));
    return id;
  }, [document.crossLinks, nodes, setDocument]);

  const deleteCrossLink = useCallback((id) => {
    setDocument((current) => ({ ...current, crossLinks: current.crossLinks.filter((link) => link.id !== id) }));
  }, [setDocument]);

  /** Moves a topic under `parentId`, optionally at a sibling index and side. */
  const moveNode = useCallback((nodeId, { parentId, index, side } = {}) => {
    const movingNode = nodes.find((node) => node.id === nodeId);
    const parent = nodes.find((node) => node.id === parentId);
    if (!movingNode || !parent || !canReparent(nodes, nodeId, parentId) || !canAcceptChildren(parent)) return false;
    if (movingNode.type === "topic" && !movingNode.data.parentId) return false;
    setDocument((current) => {
      const latest = current.nodes.find((node) => node.id === nodeId);
      if (!latest || !canReparent(current.nodes, nodeId, parentId)) return current;
      const moved = { ...latest, data: { ...latest.data, parentId, side: side !== undefined ? side : latest.data.parentId === parentId ? latest.data.side : "" } };
      const others = current.nodes.filter((node) => node.id !== nodeId);
      const position = Number.isInteger(index) ? Math.min(Math.max(index, 0), others.length) : others.length;
      others.splice(position, 0, moved);
      return { ...current, nodes: relayout(current, others) };
    });
    return true;
  }, [nodes, setDocument]);

  const reparentNode = useCallback((nodeId, parentId) => moveNode(nodeId, { parentId }), [moveNode]);

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
    setDocument((current) => ({ ...current, layout, nodes: isAutoLayout(layout) ? autoLayout(current.nodes, layout, { spacing: current.settings?.spacing }) : current.nodes }));
  }, [document.layout, setDocument]);

  const setAllNodes = useCallback((mapper) => {
    setDocument((current) => ({ ...current, nodes: relayout(current, current.nodes.map((node) => ({ ...node, data: { ...node.data, ...mapper(node, current.nodes) } }))) }));
  }, [setDocument]);
  const expandAll = useCallback(() => setAllNodes(() => ({ collapsed: false })), [setAllNodes]);
  const collapseAll = useCallback(() => setAllNodes((node, all) => ({ collapsed: Boolean(node.data.parentId) && all.some((child) => child.data.parentId === node.id) })), [setAllNodes]);
  const showHidden = useCallback(() => setAllNodes(() => ({ hidden: false })), [setAllNodes]);

  const updateSettings = useCallback((updates) => {
    setDocument((current) => {
      const next = { ...current, settings: { ...current.settings, ...updates } };
      return "spacing" in updates ? { ...next, nodes: relayout(next, next.nodes) } : next;
    });
  }, [setDocument]);

  const onNodesChange = useCallback((changes) => {
    const hasGeometryChange = changes.some((change) => change.type === "dimensions"
      && (Number.isFinite(change.dimensions?.width) || Number.isFinite(change.dimensions?.height)));
    // Selection lives in React state, not in the saved document.
    const documentChanges = changes.filter((change) => change.type === "dimensions" || change.type === "position");
    // Keep every measured size, then batch exactly one layout pass per frame.
    if (documentChanges.length) updateNodes((current) => applyNodeChanges(documentChanges, current), { record: false });
    if (hasGeometryChange && layoutFrameRef.current === null) {
      layoutFrameRef.current = window.requestAnimationFrame(() => {
        layoutFrameRef.current = null;
        updateNodes((current) => current, { record: false, reflow: true });
      });
    }
    // Clicks are handled by the page; only the Shift+drag selection box lands here.
    const selection = changes.filter((change) => change.type === "select" && change.selected).map((change) => change.id);
    if (selection.length > 1) setSelectedIds(selection);
  }, [updateNodes]);

  const recordDrag = useCallback(() => {
    setHistory((current) => ({ past: [...current.past, { ...document, nodes: cloneNodes(nodes) }].slice(-HISTORY_LIMIT), future: [] }));
  }, [document, nodes]);

  // --------------------------------------------------------------- library --

  const openDocument = useCallback((id) => {
    const next = documentsRef.current.find((item) => item.id === id);
    if (!next) return;
    activate(id);
    setSelectedIds([firstRootId(next)].filter(Boolean));
    setFocusId(null);
    setHistory({ past: [], future: [] });
  }, [activate]);

  const addDocument = useCallback((next) => {
    commitDocuments([next, ...documentsRef.current]);
    markDirty(next.id);
    openDocument(next.id);
    return next.id;
  }, [commitDocuments, markDirty, openDocument]);

  const createDocument = useCallback((templateId = "blank", { folder = "" } = {}) => {
    const next = createFromTemplate(templateId);
    next.folder = folder;
    return addDocument(next);
  }, [addDocument]);

  const importDocument = useCallback((next) => addDocument(next), [addDocument]);
  const duplicateDocument = useCallback((id) => {
    const source = documentsRef.current.find((item) => item.id === id);
    return source ? addDocument(duplicateMapDocument(source)) : null;
  }, [addDocument]);

  const setDocumentMeta = useCallback((id, updates) => updateDocumentById(id, updates), [updateDocumentById]);

  const switchAwayFrom = useCallback((id) => {
    if (activeIdRef.current !== id) return;
    const next = documentsRef.current.find((item) => item.id !== id && isLive(item));
    if (next) openDocument(next.id);
    else addDocument(createInitialDocument());
  }, [addDocument, openDocument]);

  const trashDocument = useCallback((id) => {
    updateDocumentById(id, { trashedAt: new Date().toISOString() });
    switchAwayFrom(id);
  }, [switchAwayFrom, updateDocumentById]);

  const restoreDocument = useCallback((id) => {
    updateDocumentById(id, { trashedAt: null });
    openDocument(id);
  }, [openDocument, updateDocumentById]);

  const deleteDocumentForever = useCallback(async (id) => {
    switchAwayFrom(id);
    commitDocuments(documentsRef.current.filter((item) => item.id !== id));
    dirtyRef.current.delete(id);
    try { await removeMindMap(id); } catch (error) { if (error.status !== 404) setSaveStatus("error"); }
  }, [commitDocuments, switchAwayFrom]);

  const emptyTrash = useCallback(async () => {
    const trashed = documentsRef.current.filter((item) => !isLive(item)).map((item) => item.id);
    for (const id of trashed) await deleteDocumentForever(id);
    return trashed.length;
  }, [deleteDocumentForever]);

  const saveNow = useCallback(() => persistDirtyDocuments(), [persistDirtyDocuments]);

  // ------------------------------------------------------------- derived --

  const resolved = useMemo(() => resolveNodeStyles(nodes, document.settings), [document.settings, nodes]);
  const branchModes = useMemo(() => computeBranchModes(nodes, document.layout), [document.layout, nodes]);
  const visibleNodes = useMemo(() => getVisibleNodes(nodes, focusId), [focusId, nodes]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const edges = useMemo(() => buildEdges(nodes, document.settings, document.relations, document.crossLinks, {
    layout: document.layout,
    styles: resolved.styles,
    modes: branchModes,
    crossLinkColor: resolved.crossLinkColor,
  }).filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)), [branchModes, document.crossLinks, document.layout, document.relations, document.settings, nodes, resolved, visibleIds]);

  return {
    documents, document, nodes: visibleNodes, allNodes: nodes, edges, selectedNode, resolved, branchModes,
    selectedIds, setSelectedIds, setActiveId: openDocument, focusId, setFocusId, isLoaded, reload: loadRemote,
    setDocument, updateSettings, updateSelected, updateNodesData, updateNodeStyle, onNodesChange, recordDrag,
    addNode, addSibling, addRootNode, deleteSelected, removeNodes, duplicateSelected, addImageNode, attachImage, addTree, sortChildren,
    resetStyle, copyStyle, pasteStyle, hasClipboardBranch,
    updateRelation, addCrossLink, deleteCrossLink, reparentNode, moveNode, moveSubtree,
    copy, cut, paste, undo, redo, arrange, expandAll, collapseAll, showHidden,
    createDocument, importDocument, duplicateDocument, setDocumentMeta, trashDocument, restoreDocument, deleteDocumentForever, emptyTrash,
    saveNow, saveStatus, lastSavedAt,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
};
