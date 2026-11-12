import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Background, BackgroundVariant, getNodesBounds, getViewportForBounds, MarkerType, ReactFlow, ReactFlowProvider, useReactFlow,
} from "@xyflow/react";
import { CircleAlert, Focus, ImagePlus, LoaderCircle, RotateCw, Spline, X } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { toast } from "react-toastify";
import "@xyflow/react/dist/style.css";
import "@/styles/mindmap.css";
import TopicNode from "@/components/mindmap/TopicNode";
import ImageNode from "@/components/mindmap/ImageNode";
import RelationEdge from "@/components/mindmap/RelationEdge";
import MapSidebar from "@/components/mindmap/MapSidebar";
import MapToolbar from "@/components/mindmap/MapToolbar";
import InspectorPanel from "@/components/mindmap/InspectorPanel";
import { INSPECTOR_TABS } from "@/components/mindmap/inspectorTabs";
import TopicToolbar from "@/components/mindmap/TopicToolbar";
import ContextMenu from "@/components/mindmap/ContextMenu";
import { BrainstormDialog, ShortcutsDialog, TemplateDialog } from "@/components/mindmap/Dialogs";
import { BranchBorders, PresentationBar, ZoomControls } from "@/components/mindmap/CanvasOverlays";
import { buildSlides } from "@/mindmap/slides";
import { useMindMap } from "@/hooks/useMindMap";
import { useImageAssets } from "@/hooks/useImageAssets";
import { storeImageFile } from "@/mindmap/imageStore";
import { getImageNodeSize } from "@/mindmap/imageSizing";
import { dropSlotForPosition, findDropParent, getDescendantIds, getNodeSize, isAutoLayout } from "@/mindmap/layout";
import { createOutline, escapeHtml, safeFileName } from "@/mindmap/outline";
import { validateImportedDocument } from "@/mindmap/storage";
import { computeNumbering, getStyleSheet } from "@/mindmap/styles";
import { countDatedTopics, importFromFile, parseTextOutline, toFreeMind, toIcs, toMarkdown, toOpml, toTextOutline } from "@/mindmap/formats";
import { useAuth } from "@/auth/useAuth";

const NODE_TYPES = { topic: TopicNode, image: ImageNode };
const EDGE_TYPES = { relation: RelationEdge };
const TAB_IDS = INSPECTOR_TABS.map((tab) => tab.id);

const readSetting = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const writeSetting = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
};

const downloadBlob = (content, fileName, type) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const isTyping = (target) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  || target instanceof HTMLSelectElement || target?.isContentEditable;

const centerOf = (node) => {
  const size = getNodeSize(node);
  return { x: node.position.x + size.width / 2, y: node.position.y + size.height / 2 };
};

const MindMapWorkspace = () => {
  const { user } = useAuth();
  const map = useMindMap(user);
  const flow = useReactFlow();
  const wrapperRef = useRef(null);
  const importRef = useRef(null);
  const imageInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const noteRef = useRef(null);
  const pendingImageTargetRef = useRef(null);
  const dragPositionsRef = useRef(null);
  const dropParentIdRef = useRef(null);
  const editTimesRef = useRef(new Map());
  const assets = useImageAssets(map.allNodes);

  const wide = typeof window === "undefined" || window.innerWidth > 1100;
  const [sidebarOpen, setSidebarOpen] = useState(() => readSetting("feynman.ui.sidebar", wide ? "1" : "0") === "1");
  const [inspectorTab, setInspectorTab] = useState(() => {
    const saved = readSetting("feynman.ui.inspector", wide ? "style" : "");
    return TAB_IDS.includes(saved) ? saved : null;
  });
  const [uiTheme, setUiTheme] = useState(() => readSetting("feynman.ui.theme", "system"));
  const [query, setQuery] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [crossLinkSource, setCrossLinkSource] = useState(null);
  const [isFileDragging, setIsFileDragging] = useState(false);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [presentation, setPresentation] = useState(null);
  const [editRequest, setEditRequest] = useState(null);
  const [teacherQuickAction, setTeacherQuickAction] = useState(null);
  const [newMapFolder, setNewMapFolder] = useState("");

  const { settings } = map.document;
  const sheet = getStyleSheet(settings.styleSheet);
  const { resolved } = map;

  // ------------------------------------------------------------ app state --

  useEffect(() => writeSetting("feynman.ui.sidebar", sidebarOpen ? "1" : "0"), [sidebarOpen]);
  useEffect(() => writeSetting("feynman.ui.inspector", inspectorTab || ""), [inspectorTab]);
  useEffect(() => {
    writeSetting("feynman.ui.theme", uiTheme);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.uiTheme = uiTheme === "system" ? (media?.matches ? "dark" : "light") : uiTheme; };
    apply();
    media?.addEventListener?.("change", apply);
    return () => media?.removeEventListener?.("change", apply);
  }, [uiTheme]);

  // "/mindmap?map=<id>" (e.g. a mind map created from a course) opens that map once the library is loaded.
  const { isLoaded: mapsLoaded, documents: mapDocuments, setActiveId: openMap } = map;
  useEffect(() => {
    if (!mapsLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("map");
    if (!wanted) return;
    if (mapDocuments.some((item) => item.id === wanted)) openMap(wanted);
    params.delete("map");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [mapsLoaded, mapDocuments, openMap]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const login = params.get("login");
    if (!login) return;
    if (login !== "success") toast.error(params.get("message") || "Đăng nhập không thành công.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Fit the map whenever another map is opened or the library finishes loading.
  useEffect(() => {
    if (!map.isLoaded) return undefined;
    const timer = window.setTimeout(() => flow.fitView({ padding: 0.2, maxZoom: 1.1, duration: 300 }), 120);
    return () => window.clearTimeout(timer);
  }, [flow, map.document.id, map.isLoaded]);

  const selectNodes = useCallback((ids) => {
    map.setSelectedIds(ids);
    setSelectedEdgeId(null);
  }, [map]);

  const startEditing = useCallback((id, seed) => setEditRequest({ id, token: `${Date.now()}-${Math.random()}`, seed }), []);

  /** Edits coalesce into one undo step while the user keeps typing. */
  const edit = useCallback((ids, updates, burstKey) => {
    let record = true;
    if (burstKey) {
      const key = `${ids.join(",")}:${burstKey}`;
      const now = Date.now();
      record = now - (editTimesRef.current.get(key) || 0) > 1_200;
      editTimesRef.current.set(key, now);
    }
    map.updateNodesData(ids, updates, { record });
  }, [map]);

  const openTab = useCallback((tab, focusNote = false, field = null) => {
    setInspectorTab(tab);
    if (focusNote) window.setTimeout(() => noteRef.current?.focus(), 80);
    if (field === "date") window.setTimeout(() => document.querySelector('.inspector-panel input[type="date"]')?.focus(), 80);
  }, []);
  const toggleTab = useCallback((tab) => setInspectorTab((current) => (current === tab ? null : tab)), []);

  const addChild = useCallback((parentId) => {
    const target = parentId || map.selectedNode?.id || map.allNodes.find((node) => !node.data.parentId)?.id;
    if (target && map.allNodes.find((node) => node.id === target)?.data.collapsed) map.updateNodesData([target], { collapsed: false }, { record: false });
    const id = map.addNode(target);
    if (id) startEditing(id);
  }, [map, startEditing]);

  const addSibling = useCallback((before = false) => {
    const id = map.addSibling(before);
    if (id) startEditing(id);
  }, [map, startEditing]);

  // --------------------------------------------------------- AI Teacher --

  const runAiAction = useCallback((nodeId, mode) => {
    const node = map.allNodes.find((item) => item.id === nodeId && item.type === "topic");
    if (!node) return;
    if (!String(node.data.label || node.data.note || "").trim()) {
      toast.info("Hãy nhập nội dung cho topic trước khi nhờ AI kiểm tra.");
      return;
    }
    selectNodes([nodeId]);
    setInspectorTab("ai");
    setTeacherQuickAction({ nodeId, mode, requestId: crypto.randomUUID() });
  }, [map.allNodes, selectNodes]);

  const saveTeacherNote = useCallback(({ sourceNodeId, content, conversationId, mode }) => {
    const source = map.allNodes.find((node) => node.id === sourceNodeId && node.type === "topic");
    if (!source || !String(content || "").trim()) return;
    const label = { explain: "AI giải thích", debate: "AI tranh luận", verify: "AI kiểm tra", explain_rag: "AI giải thích + nguồn web", debate_rag: "AI tranh luận + nguồn web", verify_rag: "AI kiểm tra + nguồn web" }[mode] || "AI Teacher";
    map.addNode(sourceNodeId, label, {
      select: false,
      data: { icon: "graduation", note: String(content).trim(), color: "#f5f3ff", textColor: "#4c1d95", borderColor: "#a78bfa", shape: "rounded", maxWidth: 380, aiGenerated: true, aiActionMode: mode || "", aiSourceNodeId: sourceNodeId, aiConversationId: conversationId || "" },
    });
    void map.saveNow();
  }, [map]);

  // ------------------------------------------------------------ display --

  const numbers = useMemo(() => computeNumbering(map.allNodes, settings.numbering), [map.allNodes, settings.numbering]);
  const searchResults = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("vi");
    if (!value) return [];
    return map.allNodes
      .filter((node) => [node.data.label, node.data.note, node.data.link, node.data.caption, ...(node.data.labels || [])].some((field) => String(field || "").toLocaleLowerCase("vi").includes(value)))
      .slice(0, 30)
      .map((node) => ({ ...node, color: resolved.styles.get(node.id)?.branchColor }));
  }, [map.allNodes, query, resolved]);
  const matchIds = useMemo(() => new Set(searchResults.map((node) => node.id)), [searchResults]);

  const slides = useMemo(() => (presentation ? buildSlides(map.allNodes) : []), [map.allNodes, presentation]);
  const slideIds = useMemo(() => (presentation && slides[presentation.index] ? new Set(slides[presentation.index].ids) : null), [presentation, slides]);

  const childInfo = useMemo(() => {
    const info = new Map();
    const showAll = settings.checkboxes;
    map.allNodes.forEach((node) => {
      const parentId = node.data.parentId;
      if (!parentId) return;
      const entry = info.get(parentId) || { count: 0, tracked: 0, done: 0, first: null };
      entry.count += 1;
      if (!entry.first && !node.data.hidden) entry.first = node;
      if (node.type === "topic" && (showAll || node.data.checkbox || node.data.checked)) {
        entry.tracked += 1;
        if (node.data.checked) entry.done += 1;
      }
      info.set(parentId, entry);
    });
    return info;
  }, [map.allNodes, settings.checkboxes]);

  const onEditDone = useCallback((id, { committed, label, next }) => {
    setEditRequest(null);
    const node = map.allNodes.find((item) => item.id === id);
    // Escape on a brand-new empty topic removes it again.
    if (!committed && node && !label && node.data.parentId && !map.allNodes.some((item) => item.data.parentId === id)) {
      map.removeNodes([id]);
      selectNodes([node.data.parentId]);
      return;
    }
    if (next === "child") addChild(id);
  }, [addChild, map, selectNodes]);

  const displayNodes = useMemo(() => map.nodes.map((node) => {
    const asset = assets[node.data.assetId];
    const automaticImageSize = node.type === "image" && !node.data.customSize
      ? getImageNodeSize(node.data.naturalWidth || asset?.width, node.data.naturalHeight || asset?.height, 260, node.data.note)
      : null;
    const info = childInfo.get(node.id);
    const mode = map.branchModes.get(node.id);
    let childSide = null;
    if (info?.first) {
      const self = centerOf(node);
      const child = centerOf(info.first);
      childSide = mode === "v" ? (child.y >= self.y ? "bottom" : "top") : mode === "list" ? "bottom" : child.x >= self.x ? "right" : "left";
    }
    const request = editRequest?.id === node.id ? editRequest : null;
    return {
      ...node,
      ...(automaticImageSize ? { style: { ...node.style, ...automaticImageSize } } : {}),
      draggable: !node.data.locked && !presentation,
      selected: map.selectedIds.includes(node.id),
      className: [draggingNodeId === node.id && "is-dragging", slideIds && !slideIds.has(node.id) && "is-dimmed"].filter(Boolean).join(" "),
      data: {
        ...node.data,
        view: resolved.styles.get(node.id),
        number: numbers.get(node.id),
        assetUrl: asset?.url,
        imageUrl: assets[node.data.imageAssetId]?.url,
        childCount: info?.count || 0,
        childSide,
        progress: info?.tracked ? Math.round((info.done / info.tracked) * 100) : null,
        showCheckbox: node.type === "topic" && (settings.checkboxes || node.data.checkbox || node.data.checked),
        dropTarget: dropTargetId === node.id,
        searchMatch: matchIds.has(node.id),
        editRequest: request?.token,
        editSeed: request?.seed,
        onTransformStart: map.recordDrag,
        onResizeEnd: (size) => map.updateNodeStyle(node.id, { customSize: true }, { width: size.width, height: size.height }),
        onUpdate: (updates) => map.updateNodesData([node.id], updates),
        onOpenNote: () => { selectNodes([node.id]); openTab("note", true); },
        onEditDone,
      },
    };
  }), [assets, childInfo, draggingNodeId, dropTargetId, editRequest, map, matchIds, numbers, onEditDone, openTab, presentation, resolved, selectNodes, settings.checkboxes, slideIds]);

  const displayNodeById = useMemo(() => new Map(displayNodes.map((node) => [node.id, node])), [displayNodes]);

  const relationEdges = useMemo(() => map.edges.map((edge) => {
    const marker = { type: MarkerType.ArrowClosed, color: edge.data.color, width: 16, height: 16 };
    const dimmed = slideIds && !(slideIds.has(edge.source) && slideIds.has(edge.target));
    return {
      ...edge,
      selected: edge.id === selectedEdgeId,
      className: dimmed ? "is-dimmed" : "",
      markerEnd: edge.data.arrow === "end" || edge.data.arrow === "both" ? marker : undefined,
      markerStart: edge.data.arrow === "both" ? marker : undefined,
      data: {
        ...edge.data,
        onPathStart: () => map.recordDrag(),
        onControlPoint: (id, point) => map.updateRelation(id, { controlPoint: point }, { record: false }),
      },
    };
  }), [map, selectedEdgeId, slideIds]);
  const selectedEdge = relationEdges.find((edge) => edge.id === selectedEdgeId) || null;

  const selection = useMemo(() => ({
    nodes: selectedEdge ? [] : map.selectedIds.map((id) => displayNodeById.get(id) || map.allNodes.find((node) => node.id === id)).filter(Boolean)
      .map((node) => (node.data.view ? node : { ...node, data: { ...node.data, view: resolved.styles.get(node.id) } })),
    edge: selectedEdge,
  }), [displayNodeById, map.allNodes, map.selectedIds, resolved, selectedEdge]);
  const singleSelected = selection.nodes.length === 1 ? selection.nodes[0] : null;

  const outlineNodes = useMemo(() => map.allNodes.map((node) => ({ ...node, data: { ...node.data, view: resolved.styles.get(node.id) } })), [map.allNodes, resolved]);

  // -------------------------------------------------------------- actions --

  const focusNode = useCallback((node) => {
    const ancestors = [];
    let parentId = node.data.parentId;
    while (parentId) {
      const parent = map.allNodes.find((item) => item.id === parentId);
      if (parent?.data.collapsed) ancestors.push(parentId);
      parentId = parent?.data.parentId;
    }
    if (ancestors.length) map.updateNodesData(ancestors, { collapsed: false }, { record: false });
    if (map.focusId && !getDescendantIds(map.allNodes, map.focusId).has(node.id) && node.id !== map.focusId) map.setFocusId(null);
    selectNodes([node.id]);
    window.setTimeout(() => {
      const current = flow.getNode(node.id) || node;
      const size = getNodeSize(current);
      flow.setCenter(current.position.x + size.width / 2, current.position.y + size.height / 2, { zoom: Math.max(flow.getZoom(), 1), duration: 420 });
    }, ancestors.length ? 80 : 0);
  }, [flow, map, selectNodes]);

  const focusBranch = useCallback((id) => {
    map.setFocusId(id);
    window.setTimeout(() => flow.fitView({ padding: 0.25, duration: 450 }), 60);
  }, [flow, map]);

  const toggleFocus = useCallback(() => {
    if (map.focusId) { map.setFocusId(null); window.setTimeout(() => flow.fitView({ padding: 0.2, duration: 400 }), 40); }
    else if (map.selectedNode) focusBranch(map.selectedNode.id);
    else toast.info("Chọn một topic để tập trung vào nhánh đó.");
  }, [flow, focusBranch, map]);

  const arrange = useCallback((layout) => {
    map.arrange(layout);
    window.setTimeout(() => flow.fitView({ padding: 0.18, duration: 450 }), 60);
  }, [flow, map]);

  const applySheet = useCallback((styleSheet) => {
    const next = getStyleSheet(styleSheet);
    map.updateSettings({ styleSheet, background: "", relationStyle: "", relationColor: "", relationWidth: null, lineTaper: null, grid: next.pattern === "grid" ? "lines" : settings.grid === "lines" && sheet.pattern === "grid" ? "none" : settings.grid });
  }, [map, settings.grid, sheet.pattern]);

  const processImages = useCallback(async (files, position, targetId = null, mode = "connect") => {
    const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) { toast.error("Chỉ hỗ trợ PNG, JPG, WEBP, GIF và SVG."); return 0; }
    if (imageFiles.length !== files.length) toast.warning("Một số tệp không phải ảnh đã được bỏ qua.");
    let processed = 0;
    for (let index = 0; index < imageFiles.length; index += 1) {
      try {
        const asset = await storeImageFile(imageFiles[index]);
        // Never create a saved node that points only at browser cache.
        if (asset.storage !== "server") throw new Error("Ảnh chưa được lưu an toàn trên máy chủ.");
        const target = map.allNodes.find((node) => node.id === targetId);
        if (mode === "replace" && target?.type === "image" && index === 0) {
          const size = getImageNodeSize(asset.width, asset.height, Number(target.style?.width || 260), target.data.note);
          map.updateNodeStyle(targetId, { assetId: asset.id, assetName: asset.name, naturalWidth: asset.width, naturalHeight: asset.height, customSize: false }, size);
        } else if ((mode === "attach" || mode === "replace") && target?.type === "topic" && index === 0) map.attachImage(targetId, asset);
        else map.addImageNode(asset, { x: position.x + index * 32, y: position.y + index * 32 }, target?.id || null);
        processed += 1;
      } catch (error) { toast.error(error.message); }
    }
    if (processed > 0) await map.saveNow();
    return processed;
  }, [map]);

  const chooseImage = useCallback((targetId = null, mode = "connect") => {
    pendingImageTargetRef.current = { targetId, mode };
    imageInputRef.current?.click();
  }, []);

  const deleteNodes = useCallback((ids, options) => {
    const first = map.allNodes.find((node) => node.id === ids[0]);
    map.removeNodes(ids, options);
    selectNodes(first?.data.parentId ? [first.data.parentId] : []);
  }, [map, selectNodes]);

  const duplicate = useCallback((id) => map.duplicateSelected(id), [map]);

  const startCrossLink = useCallback((id) => {
    setCrossLinkSource(id);
    toast.info("Bấm vào topic đích để tạo liên kết chéo. Esc để hủy.", { autoClose: 2500, toastId: "crosslink" });
  }, []);

  const copySelection = useCallback(() => {
    const text = map.copy();
    if (text) navigator.clipboard?.writeText(text).catch(() => {});
  }, [map]);
  const cutSelection = useCallback(() => {
    const text = map.cut();
    if (text) navigator.clipboard?.writeText(text).catch(() => {});
  }, [map]);
  const pasteFromMenu = useCallback(async () => {
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { /* permission denied */ }
    if (map.hasClipboardBranch(text || undefined) || (!text && map.hasClipboardBranch())) { map.paste(); return; }
    const tree = parseTextOutline(text);
    if (tree.length) map.addTree(map.selectedNode?.id, tree);
    else toast.info("Bộ nhớ tạm đang trống.");
  }, [map]);

  const moveSelectedAmongSiblings = useCallback((direction) => {
    const node = map.selectedNode;
    if (!node?.data.parentId) return;
    const parent = map.allNodes.find((item) => item.id === node.data.parentId);
    let siblings = map.allNodes.filter((item) => item.data.parentId === node.data.parentId);
    const balancedLeft = parent && !parent.data.parentId && map.document.layout === "horizontal" && centerOf(node).x < centerOf(parent).x;
    if (balancedLeft) direction = -direction;
    siblings = siblings.filter((item) => !balancedLeft || centerOf(item).x < centerOf(parent).x);
    const position = siblings.findIndex((item) => item.id === node.id);
    const neighbour = siblings[position + direction];
    if (!neighbour) return;
    const remaining = map.allNodes.filter((item) => item.id !== node.id);
    const index = remaining.indexOf(neighbour) + (direction > 0 ? 1 : 0);
    map.moveNode(node.id, { parentId: node.data.parentId, index, side: node.data.side });
  }, [map]);

  const navigate = useCallback((key) => {
    const current = map.selectedNode ? map.nodes.find((node) => node.id === map.selectedNode.id) : null;
    if (!current) { const root = map.nodes.find((node) => !node.data.parentId); if (root) selectNodes([root.id]); return; }
    const origin = centerOf(current);
    const horizontal = key === "ArrowLeft" || key === "ArrowRight";
    const sign = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
    const best = map.nodes.filter((node) => node.id !== current.id).map((node) => {
      const point = centerOf(node);
      const main = (horizontal ? point.x - origin.x : point.y - origin.y) * sign;
      const cross = Math.abs(horizontal ? point.y - origin.y : point.x - origin.x);
      return { node, main, score: main + cross * 2.2 };
    }).filter((candidate) => candidate.main > 4).sort((a, b) => a.score - b.score)[0];
    if (best) {
      selectNodes([best.node.id]);
      const { x, y, zoom } = flow.getViewport();
      const rect = wrapperRef.current?.getBoundingClientRect();
      const point = centerOf(best.node);
      const screen = { x: point.x * zoom + x, y: point.y * zoom + y };
      if (rect && (screen.x < 80 || screen.y < 80 || screen.x > rect.width - 80 || screen.y > rect.height - 80)) flow.setCenter(point.x, point.y, { zoom, duration: 250 });
    }
  }, [flow, map.nodes, map.selectedNode, selectNodes]);

  const startPresentation = useCallback(() => {
    setContextMenu(null);
    setPresentation({ index: 0 });
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  const stopPresentation = useCallback(() => {
    setPresentation(null);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    window.setTimeout(() => flow.fitView({ padding: 0.2, duration: 400 }), 80);
  }, [flow]);

  // ------------------------------------------------------------- keyboard --

  useEffect(() => {
    if (presentation) return undefined;
    const onKeyDown = (event) => {
      if (dialog || isTyping(event.target)) return;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key;
      const lower = key.toLowerCase();
      const selected = map.selectedNode;

      if (command && /^[1-6]$/.test(key)) { event.preventDefault(); toggleTab(TAB_IDS[Number(key) - 1]); return; }
      if (command && key === "\\") { event.preventDefault(); setSidebarOpen((value) => !value); return; }
      if (command && lower === "z") { event.preventDefault(); if (event.shiftKey) map.redo(); else map.undo(); return; }
      if (command && lower === "y") { event.preventDefault(); map.redo(); return; }
      if (command && lower === "c") { if (selected) { event.preventDefault(); copySelection(); } return; }
      if (command && lower === "x") { if (selected?.data.parentId || selected?.type === "image") { event.preventDefault(); cutSelection(); } return; }
      if (command && lower === "d") { event.preventDefault(); if (selected) map.duplicateSelected(selected.id); return; }
      if (command && lower === "s") { event.preventDefault(); void map.saveNow(); return; }
      if (command && lower === "f") { event.preventDefault(); searchInputRef.current?.focus(); return; }
      if (command && lower === "a") { event.preventDefault(); selectNodes(map.nodes.map((node) => node.id)); return; }
      if (command && lower === "b") { event.preventDefault(); setDialog("brainstorm"); return; }
      if (command && lower === "l") { event.preventDefault(); if (selected) startCrossLink(selected.id); return; }
      if (command && lower === "p") { event.preventDefault(); window.print(); return; }
      if (command && key === "0") { event.preventDefault(); flow.fitView({ padding: 0.18, duration: 300 }); return; }
      if (command && key === ".") { event.preventDefault(); if (selected) map.updateNodesData([selected.id], { collapsed: !selected.data.collapsed }); return; }
      if (command && event.shiftKey && lower === "r") { event.preventDefault(); arrange(isAutoLayout(map.document.layout) ? map.document.layout : "horizontal"); return; }
      if (command && (key === "ArrowUp" || key === "ArrowDown")) { event.preventDefault(); moveSelectedAmongSiblings(key === "ArrowUp" ? -1 : 1); return; }
      if (command || event.altKey) return;
      // Plain keys edit the map only when focus is on the canvas, so Tab/Enter
      // keep working normally in the library, inspector and toolbar.
      const target = event.target;
      const inCanvas = target === document.body || Boolean(target?.closest?.(".canvas"));
      if (!inCanvas || ((key === "Enter" || key === " ") && target?.closest?.("button, a, [role='menuitem']"))) return;

      if (key === "Tab") { event.preventDefault(); addChild(); }
      else if (key === "Enter") { event.preventDefault(); if (selected) addSibling(event.shiftKey); }
      else if (key === "F2" || (key === " " && selected?.type === "topic")) { event.preventDefault(); if (selected?.type === "topic") startEditing(selected.id); }
      else if (key === "F5") { event.preventDefault(); startPresentation(); }
      else if (key === "/") { event.preventDefault(); searchInputRef.current?.focus(); }
      else if (key === "Escape") {
        setContextMenu(null);
        if (crossLinkSource) setCrossLinkSource(null);
        else if (map.focusId) { map.setFocusId(null); flow.fitView({ padding: 0.2, duration: 300 }); }
        else selectNodes([]);
      } else if (key === "Delete" || key === "Backspace") {
        event.preventDefault();
        if (selectedEdge?.data.isCrossLink) { map.deleteCrossLink(selectedEdge.id); setSelectedEdgeId(null); }
        else if (map.selectedIds.length) deleteNodes(map.selectedIds, { keepChildren: event.shiftKey });
      } else if (key.startsWith("Arrow")) { event.preventDefault(); navigate(key); }
      else if (key === "+" || key === "=") flow.zoomIn({ duration: 150 });
      else if (key === "-") flow.zoomOut({ duration: 150 });
      else if (key.length === 1 && selected?.type === "topic" && map.selectedIds.length === 1) {
        // Typing on a selected topic replaces its text, like SimpleMind.
        event.preventDefault();
        startEditing(selected.id, key);
      }
    };
    const onPaste = (event) => {
      if (dialog || isTyping(event.target)) return;
      const image = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"))?.getAsFile();
      if (image) {
        event.preventDefault();
        const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        void processImages([image], center, map.selectedNode?.id || null, "connect");
        return;
      }
      const text = event.clipboardData?.getData("text/plain") || "";
      event.preventDefault();
      if (map.hasClipboardBranch(text) || (!text.trim() && map.hasClipboardBranch())) { map.paste(); return; }
      const tree = parseTextOutline(text);
      if (tree.length) {
        map.addTree(map.selectedNode?.id, tree);
        toast.success(`Đã thêm ${tree.length > 1 ? `${tree.length} topic` : "topic"} từ văn bản.`, { autoClose: 1600 });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("paste", onPaste); };
  }, [addChild, addSibling, arrange, copySelection, crossLinkSource, cutSelection, deleteNodes, dialog, flow, map, moveSelectedAmongSiblings, navigate, presentation, processImages, selectNodes, selectedEdge, startCrossLink, startEditing, startPresentation, toggleTab]);

  // -------------------------------------------------------------- export --

  const fileBase = safeFileName(map.document.title);
  const captureFullMap = async (capture) => {
    const viewport = wrapperRef.current?.querySelector(".react-flow__viewport");
    if (!viewport) throw new Error("Canvas unavailable");
    const bounds = getNodesBounds(displayNodes);
    const imageWidth = Math.min(12000, Math.max(1200, bounds.width + 160));
    const imageHeight = Math.min(12000, Math.max(800, bounds.height + 160));
    const { x, y, zoom } = getViewportForBounds(bounds, imageWidth, imageHeight, 0.5, 2, 0.08);
    const dataUrl = await capture(viewport, {
      backgroundColor: resolved.background,
      width: imageWidth,
      height: imageHeight,
      pixelRatio: 2,
      // Skip floating tools and hover-only collapse buttons in exported images.
      filter: (element) => !element.classList?.contains("react-flow__node-toolbar")
        && !(element.classList?.contains("topic-collapse") && !element.classList.contains("is-collapsed"))
        && !element.classList?.contains("edge-halo"),
      style: { width: `${imageWidth}px`, height: `${imageHeight}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` },
    });
    return { dataUrl, imageWidth, imageHeight };
  };
  const exports = {
    png: async () => {
      try { const { dataUrl } = await captureFullMap(toPng); const anchor = document.createElement("a"); anchor.href = dataUrl; anchor.download = `${fileBase}.png`; anchor.click(); }
      catch { toast.error("Không thể xuất PNG. Vui lòng thử lại."); }
    },
    svg: async () => {
      try { const { dataUrl } = await captureFullMap(toSvg); const anchor = document.createElement("a"); anchor.href = dataUrl; anchor.download = `${fileBase}.svg`; anchor.click(); }
      catch { toast.error("Không thể xuất SVG. Vui lòng thử lại."); }
    },
    pdf: async () => {
      try {
        const { dataUrl, imageWidth, imageHeight } = await captureFullMap(toPng);
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: imageWidth >= imageHeight ? "landscape" : "portrait", unit: "px", format: [imageWidth, imageHeight], hotfixes: ["px_scaling"] });
        pdf.addImage(dataUrl, "PNG", 0, 0, imageWidth, imageHeight, undefined, "FAST");
        pdf.save(`${fileBase}.pdf`);
      } catch { toast.error("Không thể xuất PDF. Vui lòng thử lại."); }
    },
    print: () => window.print(),
    markdown: () => downloadBlob(toMarkdown(map.document), `${fileBase}.md`, "text/markdown;charset=utf-8"),
    opml: () => downloadBlob(toOpml(map.document), `${fileBase}.opml`, "text/x-opml;charset=utf-8"),
    freemind: () => downloadBlob(toFreeMind(map.document), `${fileBase}.mm`, "application/x-freemind;charset=utf-8"),
    text: () => downloadBlob(toTextOutline(map.document), `${fileBase}.txt`, "text/plain;charset=utf-8"),
    html: () => {
      const title = escapeHtml(map.document.title);
      downloadBlob(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:0 24px;color:#172033}h1{border-bottom:1px solid #dbe4f0;padding-bottom:16px}ul{padding-left:28px}li{margin:7px 0}</style></head><body><h1>${title}</h1><ul>${createOutline(map.allNodes, "html")}</ul></body></html>`, `${fileBase}.html`, "text/html;charset=utf-8");
    },
    ics: () => {
      if (!countDatedTopics(map.document)) { toast.info("Chưa có topic nào có ngày. Thêm ngày trong tab Ghi chú."); return; }
      downloadBlob(toIcs(map.document), `${fileBase}.ics`, "text/calendar;charset=utf-8");
    },
    json: () => downloadBlob(JSON.stringify(map.document, null, 2), `${fileBase}.feynman.json`, "application/json"),
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const content = await file.text();
      const document = /\.json$/i.test(file.name) ? validateImportedDocument(JSON.parse(content)) : importFromFile(file.name, content);
      if (!document) throw new Error("Định dạng chưa hỗ trợ. Dùng .json, .opml, .mm, .md hoặc .txt.");
      map.importDocument(document);
      toast.success(`Đã nhập “${document.title}”.`);
    } catch (error) { toast.error(error.message || "Không đọc được tệp."); }
  };

  const onImageInput = async (event) => {
    const files = event.target.files;
    if (files?.length) {
      const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const pending = pendingImageTargetRef.current;
      await processImages(files, center, pending ? pending.targetId : map.selectedNode?.id || null, pending?.mode || "connect");
    }
    pendingImageTargetRef.current = null;
    event.target.value = "";
  };

  // ------------------------------------------------------------ canvas --

  const onCanvasDrop = async (event) => {
    event.preventDefault();
    setIsFileDragging(false);
    setDropTargetId(null);
    if (!event.dataTransfer.files?.length) return;
    const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const targetId = event.target.closest?.(".react-flow__node")?.dataset?.id;
    const direct = map.allNodes.find((node) => node.id === targetId);
    await processImages(event.dataTransfer.files, position, direct?.id || map.selectedNode?.id || null, direct?.type === "topic" && event.altKey ? "attach" : "connect");
  };

  const onNodeClick = (event, node) => {
    setContextMenu(null);
    if (crossLinkSource && node.id !== crossLinkSource) {
      const id = map.addCrossLink(crossLinkSource, node.id);
      setCrossLinkSource(null);
      if (id) { setSelectedEdgeId(id); map.setSelectedIds([]); }
      else toast.warning("Hai topic này đã được nối với nhau.");
      return;
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      map.setSelectedIds((current) => (current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id]));
      setSelectedEdgeId(null);
      return;
    }
    selectNodes([node.id]);
  };

  const getDropParent = useCallback((node, event) => {
    if (node.data.locked) return null;
    const position = event && Number.isFinite(event.clientX) ? flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) : centerOf(node);
    return findDropParent(flow.getNodes(), node.id, position, 6);
  }, [flow]);

  const onNodeDragStart = (_, node) => {
    map.recordDrag();
    dragPositionsRef.current = new Map(map.allNodes.map((item) => [item.id, { ...item.position }]));
    if (!map.selectedIds.includes(node.id)) selectNodes([node.id]);
    setDraggingNodeId(node.id);
    dropParentIdRef.current = null;
  };

  const onNodeDrag = (event, node) => {
    if (dragPositionsRef.current) map.moveSubtree(node.id, node.position, dragPositionsRef.current);
    const parent = getDropParent(node, event);
    const valid = parent && parent.id !== node.data.parentId ? parent.id : null;
    dropParentIdRef.current = valid;
    setDropTargetId(valid);
  };

  const onNodeDragStop = (event, node) => {
    const pointer = event && Number.isFinite(event.clientX) ? flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) : centerOf(node);
    const parent = map.allNodes.find((item) => item.id === dropParentIdRef.current);
    const layout = map.document.layout;
    setDropTargetId(null);
    setDraggingNodeId(null);
    dropParentIdRef.current = null;
    dragPositionsRef.current = null;
    if (parent) {
      const isRootParent = !parent.data.parentId;
      const side = isRootParent && layout === "horizontal" ? (pointer.x < centerOf(parent).x ? "left" : "right")
        : isRootParent && layout === "vertical" ? (pointer.y < centerOf(parent).y ? "top" : "bottom") : "";
      if (!map.moveNode(node.id, { parentId: parent.id, side })) toast.warning("Không thể nối vào nhánh con của chính topic này.");
      return;
    }
    if (!isAutoLayout(layout)) return;
    if (!node.data.parentId) { map.arrange(layout); return; }
    const slot = dropSlotForPosition(map.allNodes, node.id, pointer, layout);
    if (slot) map.moveNode(node.id, slot);
    else map.arrange(layout);
  };

  const actions = {
    edit, openTab, addChild, addSibling, chooseImage, startCrossLink, focusBranch, deleteNodes, duplicate, startEditing,
    sortChildren: map.sortChildren,
    copyStyle: (id) => { map.copyStyle(id); toast.info("Đã sao chép kiểu.", { autoClose: 1200 }); },
    pasteStyle: (ids) => { if (!map.pasteStyle(ids)) toast.info("Hãy sao chép kiểu của một topic trước."); },
    aiAction: runAiAction,
    updateImage: (id, updates, styles) => map.updateNodeStyle(id, updates, styles),
    copy: copySelection,
    cut: cutSelection,
    paste: pasteFromMenu,
    fit: () => flow.fitView({ padding: 0.18, duration: 350 }),
    openBrainstorm: () => setDialog("brainstorm"),
    addRootAt: (x, y) => map.addRootNode(flow.screenToFlowPosition({ x, y })),
  };

  const inspectorActions = {
    ...actions,
    noteRef,
    arrange,
    applySheet,
    numbers,
    outlineNodes,
    focusNode,
    reparent: (source, target) => { if (!map.reparentNode(source, target)) toast.warning("Không thể chuyển topic vào nhánh con của chính nó."); },
    deleteEdge: (edge) => { map.deleteCrossLink(edge.id); setSelectedEdgeId(null); },
    teacherQuickAction,
    saveTeacherNote,
  };

  const contextNode = contextMenu?.nodeId ? displayNodeById.get(contextMenu.nodeId) : null;
  const showTopicToolbar = singleSelected && !selectedEdge && !draggingNodeId && !presentation && !crossLinkSource && !contextMenu && displayNodeById.has(singleSelected.id);
  const showGrid = settings.grid && settings.grid !== "none";

  const ui = {
    sidebarOpen, inspectorTab, uiTheme, query, searchResults, crossLinkActive: Boolean(crossLinkSource),
    toggleSidebar: () => setSidebarOpen((value) => !value),
    toggleInspector: () => setInspectorTab((current) => (current ? null : "style")),
    toggleTab,
    cycleTheme: () => setUiTheme((current) => ({ system: "light", light: "dark", dark: "system" })[current] || "system"),
    setQuery,
    focusNode,
    addChild: () => addChild(),
    addSibling: () => (map.selectedNode ? addSibling(false) : addChild()),
    toggleCrossLink: () => {
      if (crossLinkSource) { setCrossLinkSource(null); return; }
      if (map.selectedNode) startCrossLink(map.selectedNode.id);
      else toast.info("Chọn topic bắt đầu trước, rồi bấm Liên kết.");
    },
    addImage: () => chooseImage(map.selectedNode?.id || null, "connect"),
    openBrainstorm: () => setDialog("brainstorm"),
    arrange,
    toggleFocus,
    present: startPresentation,
    exports,
    importFile: () => importRef.current?.click(),
  };

  const loadingFirstTime = !map.isLoaded;

  return (
    <main className={`app-shell ${presentation ? "is-presenting" : ""} ${isFileDragging ? "is-file-dragging" : ""}`}>
      <MapToolbar map={map} ui={ui} searchInputRef={searchInputRef} />
      <div className="app-body">
        <MapSidebar map={map} open={sidebarOpen} onNewMap={(folder) => { setNewMapFolder(folder); setDialog("template"); }} onShowShortcuts={() => setDialog("shortcuts")} />
        {sidebarOpen && <button type="button" className="library-scrim" aria-label="Đóng thư viện" onClick={() => setSidebarOpen(false)} />}
        <section
          className={`canvas ${resolved.dark ? "is-dark-sheet" : ""} ${resolved.glow ? "is-glow" : ""} ${crossLinkSource ? "is-linking" : ""}`}
          ref={wrapperRef}
          style={{ "--canvas-bg": resolved.background }}
          onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setIsFileDragging(true); } }}
          onDragOver={(event) => { event.preventDefault(); if (isFileDragging) setDropTargetId(event.target.closest?.(".react-flow__node")?.dataset?.id || null); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setIsFileDragging(false); setDropTargetId(null); } }}
          onDrop={onCanvasDrop}
        >
          {isFileDragging && <div className="file-drop-overlay"><ImagePlus /><strong>{dropTargetId || map.selectedNode ? "Thả để thêm ảnh nối vào topic" : "Thả ảnh vào mind map"}</strong><span>PNG, JPG, WEBP, GIF hoặc SVG · tối đa 12 MB · giữ Alt khi thả lên topic để đặt ảnh vào trong topic</span></div>}
          {crossLinkSource && <div className="canvas-banner is-link"><Spline /> Bấm vào topic đích để tạo liên kết chéo <button type="button" onClick={() => setCrossLinkSource(null)} aria-label="Hủy"><X /></button></div>}
          {map.focusId && !presentation && <button type="button" className="canvas-banner is-focus" onClick={toggleFocus}><Focus /> Đang tập trung vào một nhánh · bấm để xem toàn bộ <X /></button>}
          {map.saveStatus === "load-error" && (
            <div className="canvas-banner is-error" role="alert"><CircleAlert /> Không tải được mind map từ máy chủ. Các thay đổi sẽ chưa được lưu. <button type="button" onClick={map.reload}><RotateCw /> Thử lại</button></div>
          )}
          {loadingFirstTime && <div className="canvas-loading"><LoaderCircle className="spin" /> Đang mở thư viện…</div>}
          <ReactFlow
            nodes={displayNodes}
            edges={relationEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={map.onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); map.setSelectedIds([]); setContextMenu(null); }}
            onPaneClick={() => { setContextMenu(null); setSelectedEdgeId(null); map.setSelectedIds([]); }}
            onNodeContextMenu={(event, node) => { event.preventDefault(); if (!map.selectedIds.includes(node.id)) selectNodes([node.id]); setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id }); }}
            onPaneContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, nodeId: null }); }}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
            minZoom={0.1}
            maxZoom={3}
            panOnScroll
            panOnDrag
            selectionKeyCode="Shift"
            multiSelectionKeyCode={["Meta", "Control"]}
            zoomOnPinch
            zoomOnDoubleClick={false}
            nodesConnectable={false}
            deleteKeyCode={null}
            panActivationKeyCode={null}
            elevateNodesOnSelect={false}
            snapToGrid={Boolean(settings.snapToGrid && showGrid)}
            snapGrid={[20, 20]}
            proOptions={{ hideAttribution: true }}
          >
            {showGrid && <Background variant={settings.grid === "dots" ? BackgroundVariant.Dots : BackgroundVariant.Lines} gap={settings.grid === "dots" ? 22 : 28} size={1.2} color={resolved.dark ? "#ffffff1f" : "#cbd5e1"} />}
            <BranchBorders nodes={map.nodes} resolved={resolved} />
            {showTopicToolbar && <TopicToolbar node={singleSelected} actions={actions} />}
            {!presentation && <ZoomControls />}
            {presentation && <PresentationBar slides={slides} index={presentation.index} onIndex={(index) => setPresentation({ index })} onExit={stopPresentation} />}
          </ReactFlow>
          <input ref={importRef} type="file" accept=".json,.opml,.mm,.md,.markdown,.txt,application/json,text/plain" hidden onChange={importFile} />
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple hidden onChange={onImageInput} />
        </section>
        {inspectorTab && !presentation && (
          <InspectorPanel tab={inspectorTab} onTabChange={setInspectorTab} onClose={() => setInspectorTab(null)} map={map} selection={selection} actions={inspectorActions} />
        )}
      </div>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} node={contextNode} actions={actions} onClose={() => setContextMenu(null)} />}
      {dialog === "template" && <TemplateDialog onClose={() => setDialog(null)} onCreate={(templateId) => { map.createDocument(templateId, { folder: newMapFolder }); setDialog(null); }} />}
      {dialog === "brainstorm" && (
        <BrainstormDialog
          parentLabel={(map.selectedNode || map.allNodes.find((node) => !node.data.parentId))?.data.label}
          onClose={() => setDialog(null)}
          onAdd={(tree) => map.addTree(map.selectedNode?.id, tree)}
        />
      )}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </main>
  );
};

const MindMapPage = () => {
  const { user, loading } = useAuth();
  if (loading) return <main className="app-loading"><LoaderCircle className="spin" /> Đang tải tài khoản…</main>;
  if (!user) return <Navigate to="/login" replace />;
  return <ReactFlowProvider><MindMapWorkspace /></ReactFlowProvider>;
};

export default MindMapPage;
