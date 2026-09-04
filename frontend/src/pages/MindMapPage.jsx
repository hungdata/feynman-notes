import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Background, BackgroundVariant, Controls, getNodesBounds, getViewportForBounds,
  ReactFlow, ReactFlowProvider, useReactFlow,
} from "@xyflow/react";
import { Download, Focus, ImagePlus, Maximize2, Search, Upload, X } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { toast } from "react-toastify";
import "@xyflow/react/dist/style.css";
import "@/styles/mindmap.css";
import TopicNode from "@/components/mindmap/TopicNode";
import ImageNode from "@/components/mindmap/ImageNode";
import RelationEdge from "@/components/mindmap/RelationEdge";
import MapSidebar from "@/components/mindmap/MapSidebar";
import Inspector from "@/components/mindmap/Inspector";
import ImageInspector from "@/components/mindmap/ImageInspector";
import RelationInspector from "@/components/mindmap/RelationInspector";
import OutlinePanel from "@/components/mindmap/OutlinePanel";
import MapInspector from "@/components/mindmap/MapInspector";
import PropertyPanelLayer from "@/components/mindmap/PropertyPanelLayer";
import MapToolbar from "@/components/mindmap/MapToolbar";
import ContextMenu from "@/components/mindmap/ContextMenu";
import TeacherPanel from "@/components/mindmap/TeacherPanel";
import { useMindMap } from "@/hooks/useMindMap";
import { useImageAssets } from "@/hooks/useImageAssets";
import { storeImageFile } from "@/mindmap/imageStore";
import { getImageNodeSize } from "@/mindmap/imageSizing";
import { DEFAULT_PANEL_GAP } from "@/mindmap/panelLayout";
import { autoLayout, findDropParent, getDescendantIds, TOPIC_NODE_WIDTH } from "@/mindmap/layout";
import { createOutline, escapeHtml, safeFileName } from "@/mindmap/outline";
import { validateImportedDocument } from "@/mindmap/storage";
import { useAuth } from "@/auth/useAuth";

const NODE_TYPES = { topic: TopicNode, image: ImageNode };
const EDGE_TYPES = { relation: RelationEdge };
const fallbackNodeWidth = (node) => node?.type === "image" ? 260 : TOPIC_NODE_WIDTH;
const panelId = (documentId, kind, targetId = "map") => `${documentId}:${kind}:${targetId}`;
const reflowHorizontalNodes = (document, nodes) =>
  document.layout === "horizontal" ? autoLayout(nodes, "horizontal") : nodes;

const downloadBlob = (content, fileName, type) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click();
  URL.revokeObjectURL(url);
};

const MindMapWorkspace = () => {
  const { user } = useAuth();
  const map = useMindMap(user);
  const flow = useReactFlow();
  const wrapperRef = useRef(null);
  const importRef = useRef(null);
  const imageInputRef = useRef(null);
  const pendingImageTargetRef = useRef(null);
  const dragPositionsRef = useRef(null);
  const dropParentIdRef = useRef(null);
  const assets = useImageAssets(map.allNodes);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openPanels, setOpenPanels] = useState([]);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineMode, setOutlineMode] = useState("tree");
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [teacherQuickCheck, setTeacherQuickCheck] = useState(null);
  const [query, setQuery] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [crossLinkSource, setCrossLinkSource] = useState(null);
  const [isFileDragging, setIsFileDragging] = useState(false);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [panelLayoutVersion, setPanelLayoutVersion] = useState(0);
  const panelLayoutFrameRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const login = params.get("login");
    if (!login) return;
    if (login === "success") toast.success(`Đăng nhập ${params.get("provider") || "tài khoản"} thành công.`);
    else toast.error(params.get("message") || "Đăng nhập không thành công.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const updateNodeById = useCallback((id, updates, styleUpdates = null) => {
    if (map.selectedNode?.id !== id) map.setSelectedIds([id]);
    map.setDocument((document) => {
      const nextNodes = document.nodes.map((node) => node.id === id ? {
        ...node,
        ...(styleUpdates ? { style: { ...node.style, ...styleUpdates } } : {}),
        data: { ...node.data, ...updates },
      } : node);
      // Text, font and image dimensions can change the rendered card after
      // React Flow has measured it.  Reflow immediately using the best known
      // size, then `onNodesChange(dimensions)` performs one final measured
      // pass. This prevents a resized image from sitting on the next row.
      const affectsGeometry = Boolean(styleUpdates)
        || ["label", "fontSize", "fontWeight", "imageAssetId", "topicImageHeight", "layout", "collapsed", "hidden", "rotation"].some((key) => key in updates);
      return {
        ...document,
        nodes: affectsGeometry ? reflowHorizontalNodes(document, nextNodes) : nextNodes,
      };
    });
  }, [map]);

  const openPropertyPanel = useCallback((kind, targetId = "map") => {
    const id = panelId(map.document.id, kind, targetId);
    setOpenPanels((current) => current.some((panel) => panel.id === id)
      ? current
      : [...current, { id, kind, targetId, documentId: map.document.id }]);
  }, [map.document.id]);

  const closePropertyPanel = useCallback((id) => {
    setOpenPanels((current) => current.filter((panel) => panel.id !== id));
  }, []);

  const refreshPanelAnchors = useCallback(() => {
    if (panelLayoutFrameRef.current !== null) return;
    panelLayoutFrameRef.current = window.requestAnimationFrame(() => {
      panelLayoutFrameRef.current = null;
      setPanelLayoutVersion((version) => version + 1);
    });
  }, []);

  useEffect(() => () => {
    if (panelLayoutFrameRef.current !== null) window.cancelAnimationFrame(panelLayoutFrameRef.current);
  }, []);

  const progressByNode = useMemo(() => {
    const values = new Map();
    map.allNodes.forEach((node) => {
      const children = map.allNodes.filter((child) => child.data.parentId === node.id && child.type === "topic");
      const trackable = children.filter((child) => typeof child.data.checked === "boolean");
      values.set(node.id, trackable.length ? Math.round((trackable.filter((child) => child.data.checked).length / trackable.length) * 100) : null);
    });
    return values;
  }, [map.allNodes]);

  const checkNoteWithAi = useCallback((nodeId) => {
    const node = map.allNodes.find((item) => item.id === nodeId && item.type === "topic");
    if (!node) return;
    if (!String(node.data.label || node.data.note || "").trim()) {
      toast.info("Hãy nhập nội dung cho note trước khi yêu cầu AI kiểm tra.");
      return;
    }
    map.setSelectedIds([nodeId]);
    setSelectedEdgeId(null);
    setOutlineOpen(false);
    setOpenPanels([]);
    setTeacherOpen(true);
    setTeacherQuickCheck({ nodeId, requestId: crypto.randomUUID() });
  }, [map]);

  const displayNodes = useMemo(() => map.nodes.map((node) => {
    const asset = assets[node.data.assetId];
    const automaticImageSize = node.type === "image" && !node.data.customSize
      ? getImageNodeSize(node.data.naturalWidth || asset?.width, node.data.naturalHeight || asset?.height, 260, node.data.note)
      : null;
    return {
      ...node,
      ...(automaticImageSize ? { style: { ...node.style, ...automaticImageSize } } : {}),
      draggable: !node.data.locked,
      selected: map.selectedIds.includes(node.id),
      className: [dropTargetId === node.id && "drop-target-node", draggingNodeId === node.id && "dragging-map-node"].filter(Boolean).join(" "),
      data: {
        ...node.data,
        assetUrl: asset?.url,
        imageUrl: assets[node.data.imageAssetId]?.url,
        childCount: map.allNodes.filter((item) => item.data.parentId === node.id).length,
        progress: node.type === "topic" ? progressByNode.get(node.id) : null,
        onTransformStart: map.recordDrag,
        onResizeEnd: (size) => updateNodeById(node.id, { customSize: true }, { width: size.width, height: size.height }),
        onUpdate: (updates) => updateNodeById(node.id, updates),
        onAiCheck: checkNoteWithAi,
      },
    };
  }), [assets, checkNoteWithAi, draggingNodeId, dropTargetId, map.allNodes, map.nodes, map.recordDrag, map.selectedIds, progressByNode, updateNodeById]);

  const displayNodeById = useMemo(() => new Map(displayNodes.map((node) => [node.id, node])), [displayNodes]);

  const relationEdges = useMemo(() => map.edges.map((edge) => ({
    ...edge,
    selected: edge.id === selectedEdgeId,
    data: {
      ...edge.data,
      onPathStart: () => map.recordDrag(),
      onControlPoint: (id, point) => map.updateRelation(id, { controlPoint: point }, { record: false }),
    },
  })), [map, selectedEdgeId]);
  const selectedEdge = relationEdges.find((edge) => edge.id === selectedEdgeId) || null;
  const visibleOpenPanels = useMemo(() => {
    const nodeIds = new Set(map.allNodes.map((node) => node.id));
    const edgeIds = new Set(relationEdges.map((edge) => edge.id));
    return openPanels.filter((panel) => panel.documentId === map.document.id && (panel.kind === "map"
      || (panel.kind === "relation" ? edgeIds.has(panel.targetId) : nodeIds.has(panel.targetId))));
  }, [map.allNodes, map.document.id, openPanels, relationEdges]);

  const searchResults = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("vi");
    if (!value) return [];
    return map.allNodes.filter((node) => [node.data.label, node.data.note, node.data.link, ...(node.data.labels || [])].some((field) => field?.toLocaleLowerCase?.("vi").includes(value))).slice(0, 20);
  }, [map.allNodes, query]);

  const focusNode = useCallback((node) => {
    const ancestors = new Set();
    let parentId = node.data.parentId;
    while (parentId) {
      ancestors.add(parentId);
      parentId = map.allNodes.find((item) => item.id === parentId)?.data.parentId;
    }
    if (ancestors.size) map.setDocument((document) => ({ ...document, nodes: document.nodes.map((item) => ancestors.has(item.id) ? { ...item, data: { ...item.data, collapsed: false } } : item) }));
    map.setSelectedIds([node.id]);
    setSelectedEdgeId(null);
    flow.setCenter(node.position.x + 100, node.position.y + 30, { zoom: 1.2, duration: 450 });
  }, [flow, map]);

  const processImages = useCallback(async (files, position, targetId = null, mode = "connect") => {
    const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) { toast.error("Chỉ hỗ trợ PNG, JPG, WEBP, GIF và SVG an toàn."); return 0; }
    if (imageFiles.length !== files.length) toast.warning("Một số tệp không phải ảnh đã được bỏ qua.");
    let processed = 0;
    for (let index = 0; index < imageFiles.length; index += 1) {
      try {
        const asset = await storeImageFile(imageFiles[index]);
        // Never create a persisted node that points only at browser cache.
        // `storeImageFile` resolves only after GridFS/server storage confirms
        // the upload; keep this guard in the UI as an invariant.
        if (asset.storage !== "server") throw new Error("Ảnh chưa được lưu an toàn trên máy chủ.");
        const targetNode = map.allNodes.find((node) => node.id === targetId);
        if (mode === "replace" && targetNode?.type === "image" && index === 0) {
          const size = getImageNodeSize(asset.width, asset.height, Number(targetNode.style?.width || 260), targetNode.data.note);
          updateNodeById(targetId, { assetId: asset.id, assetName: asset.name, naturalWidth: asset.width, naturalHeight: asset.height, customSize: false }, size);
        }
        else if (mode === "attach" && targetNode?.type === "topic" && index === 0) map.attachImage(targetId, asset);
        else map.addImageNode(asset, { x: position.x + index * 32, y: position.y + index * 32 }, targetNode?.id || null, index);
        processed += 1;
      } catch (error) { toast.error(error.message); }
    }
    if (processed > 0) {
      const saved = await map.saveNow();
      if (!saved) toast.warning("Ảnh đã được lưu; note sẽ tự lưu lại khi máy chủ sẵn sàng.");
    }
    return processed;
  }, [map, updateNodeById]);

  // A property panel can remain open after another node is selected.  These
  // actions therefore take an explicit id instead of using map.selectedNode.
  const deleteNodeById = useCallback((nodeId) => {
    const target = map.allNodes.find((node) => node.id === nodeId);
    if (!target || (target.type !== "image" && !target.data.parentId)) return;
    const ids = getDescendantIds(map.allNodes, nodeId);
    ids.add(nodeId);
    map.setDocument((document) => {
      const remainingNodes = document.nodes.filter((node) => !ids.has(node.id));
      const validRelations = new Set(remainingNodes.filter((node) => node.data.parentId).map((node) => `${node.data.parentId}-${node.id}`));
      return {
        ...document,
        nodes: reflowHorizontalNodes(document, remainingNodes),
        crossLinks: document.crossLinks.filter((link) => !ids.has(link.source) && !ids.has(link.target)),
        relations: Object.fromEntries(Object.entries(document.relations).filter(([id]) => validRelations.has(id))),
      };
    });
    map.setSelectedIds(target.data.parentId ? [target.data.parentId] : []);
    setOpenPanels((current) => current.filter((panel) => !ids.has(panel.targetId)));
  }, [map]);

  const duplicateNodeById = useCallback((nodeId) => {
    const target = map.allNodes.find((node) => node.id === nodeId);
    if (!target) return;
    const ids = getDescendantIds(map.allNodes, target.id);
    ids.add(target.id);
    const branch = map.allNodes.filter((node) => ids.has(node.id));
    const idMap = new Map(branch.map((node) => [node.id, crypto.randomUUID()]));
    const copyId = idMap.get(target.id);
    map.setDocument((document) => {
      const copies = branch.map((node) => ({
        ...node,
        id: idMap.get(node.id),
        position: { x: node.position.x + 36, y: node.position.y + 72 },
        data: {
          ...node.data,
          ...(node.type === "topic" && node.id === target.id ? { label: `${node.data.label} (bản sao)` } : {}),
          parentId: idMap.get(node.data.parentId) || node.data.parentId,
        },
      }));
      const nodes = [...document.nodes, ...copies];
      return { ...document, nodes: reflowHorizontalNodes(document, nodes) };
    });
    map.setSelectedIds([copyId]);
    openPropertyPanel(target.type === "image" ? "image" : "topic", copyId);
  }, [map, openPropertyPanel]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
      const command = event.metaKey || event.ctrlKey;
      if (event.key === "Tab") { event.preventDefault(); map.addNode(map.selectedNode?.id); }
      else if (event.key === "Enter") { event.preventDefault(); map.addSibling(); }
      else if (event.key === "Escape") { setCrossLinkSource(null); setSelectedEdgeId(null); map.setFocusId(null); map.setSelectedIds([]); }
      else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); if (selectedEdge?.data.isCrossLink) { map.deleteCrossLink(selectedEdge.id); setSelectedEdgeId(null); } else map.deleteSelected(); }
      else if (command && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? map.redo() : map.undo(); }
      else if (command && event.key.toLowerCase() === "y") { event.preventDefault(); map.redo(); }
      else if (command && event.key.toLowerCase() === "c") map.copy();
      else if (command && event.key.toLowerCase() === "x") map.cut();
      else if (command && event.key.toLowerCase() === "v") map.paste();
      else if (command && event.key.toLowerCase() === "d") { event.preventDefault(); map.duplicateSelected(); }
      else if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        map.saveNow().then((saved) => {
          if (saved) toast.success("Mind map đã được lưu trên máy chủ.");
          else toast.warning("Chưa thể lưu; hệ thống sẽ tự thử lại.");
        });
      }
      else if (command && event.key.toLowerCase() === "f") { event.preventDefault(); document.querySelector(".sidebar-search input")?.focus(); }
      else if (command && event.key.toLowerCase() === "a") { event.preventDefault(); map.setSelectedIds(map.nodes.map((node) => node.id)); }
      else if (event.key === "+" || event.key === "=") flow.zoomIn();
      else if (event.key === "-") flow.zoomOut();
    };
    const onPaste = (event) => {
      const image = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"))?.getAsFile();
      if (!image) return;
      event.preventDefault();
      const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      processImages([image], center, map.selectedNode?.id || null, "connect");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("paste", onPaste); };
  }, [flow, map, processImages, selectedEdge]);

  const exportJson = () => downloadBlob(JSON.stringify(map.document, null, 2), `${safeFileName(map.document.title)}.feynman.json`, "application/json");
  const exportText = () => downloadBlob(createOutline(map.allNodes), `${safeFileName(map.document.title)}-outline.txt`, "text/plain;charset=utf-8");
  const exportHtml = () => {
    const title = escapeHtml(map.document.title);
    const content = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:0 24px;color:#172033}h1{border-bottom:1px solid #dbe4f0;padding-bottom:16px}ul{padding-left:28px}li{margin:7px 0}</style></head><body><h1>${title}</h1><ul>${createOutline(map.allNodes, "html")}</ul></body></html>`;
    downloadBlob(content, `${safeFileName(map.document.title)}-outline.html`, "text/html;charset=utf-8");
  };
  const captureFullMap = async (capture) => {
    const viewport = wrapperRef.current?.querySelector(".react-flow__viewport");
    if (!viewport) throw new Error("Canvas unavailable");
    const bounds = getNodesBounds(displayNodes);
    const imageWidth = Math.min(12000, Math.max(1200, bounds.width + 160));
    const imageHeight = Math.min(12000, Math.max(800, bounds.height + 160));
    const { x, y, zoom } = getViewportForBounds(bounds, imageWidth, imageHeight, 0.5, 2, 0.08);
    const dataUrl = await capture(viewport, { backgroundColor: map.document.settings.background, width: imageWidth, height: imageHeight, pixelRatio: 2, style: { width: `${imageWidth}px`, height: `${imageHeight}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` } });
    return { dataUrl, imageWidth, imageHeight };
  };
  const exportPng = async () => {
    try {
      const { dataUrl } = await captureFullMap(toPng);
      const anchor = document.createElement("a"); anchor.href = dataUrl; anchor.download = `${safeFileName(map.document.title)}.png`; anchor.click();
    } catch { toast.error("Không thể xuất PNG. Vui lòng thử lại."); }
  };
  const exportSvg = async () => {
    try {
      const { dataUrl } = await captureFullMap(toSvg);
      const anchor = document.createElement("a"); anchor.href = dataUrl; anchor.download = `${safeFileName(map.document.title)}.svg`; anchor.click();
    } catch { toast.error("Không thể xuất SVG. Vui lòng thử lại."); }
  };
  const exportPdf = async () => {
    try {
      const { dataUrl, imageWidth, imageHeight } = await captureFullMap(toPng);
      const { jsPDF } = await import("jspdf");
      const orientation = imageWidth >= imageHeight ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "px", format: [imageWidth, imageHeight], hotfixes: ["px_scaling"] });
      pdf.addImage(dataUrl, "PNG", 0, 0, imageWidth, imageHeight, undefined, "FAST");
      pdf.save(`${safeFileName(map.document.title)}.pdf`);
    } catch { toast.error("Không thể xuất PDF. Vui lòng thử lại."); }
  };

  const importJson = async (event) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      map.importDocument(validateImportedDocument(JSON.parse(await file.text())));
      toast.success("Đã nhập mind map.");
    } catch (error) { toast.error(error.message); }
    finally { event.target.value = ""; }
  };

  const chooseImage = (targetId = null, mode = "connect") => { pendingImageTargetRef.current = { targetId, mode }; imageInputRef.current?.click(); };
  const onImageInput = async (event) => {
    const files = event.target.files;
    if (files?.length) {
      const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      await processImages(files, center, pendingImageTargetRef.current?.targetId, pendingImageTargetRef.current?.mode);
    }
    pendingImageTargetRef.current = null; event.target.value = "";
  };

  const onCanvasDrop = async (event) => {
    event.preventDefault();
    const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const targetElement = event.target.closest?.(".react-flow__node");
    const targetId = targetElement?.dataset?.id;
    const directTarget = map.allNodes.find((node) => node.id === targetId);
    const selectedTarget = map.allNodes.find((node) => node.id === map.selectedNode?.id);
    const nearestTarget = map.nodes
      .map((node) => {
        const width = Number(node.style?.width || node.measured?.width || fallbackNodeWidth(node));
        const height = Number(node.style?.height || node.measured?.height || 76);
        const dx = node.position.x + width / 2 - position.x;
        const dy = node.position.y + height / 2 - position.y;
        return { node, distance: Math.hypot(dx, dy) };
      })
      .sort((a, b) => a.distance - b.distance)[0];
    const inferredTarget = directTarget || selectedTarget || (nearestTarget?.distance <= 700 ? nearestTarget.node : null);
    const processed = await processImages(event.dataTransfer.files, position, inferredTarget?.id || null, "connect");
    if (inferredTarget && processed > 0) toast.success(`Ảnh đã được nối với “${inferredTarget.data.label || inferredTarget.data.caption || "node"}”.`);
    setIsFileDragging(false); setDropTargetId(null);
  };

  const onNodeClick = (_, node) => {
    if (crossLinkSource && node.id !== crossLinkSource) {
      const id = map.addCrossLink(crossLinkSource, node.id);
      setCrossLinkSource(null); if (id) setSelectedEdgeId(id);
      return;
    }
    map.setSelectedIds([node.id]);
    setSelectedEdgeId(null);
  };

  const onNodeDragStart = (_, node) => {
    map.recordDrag();
    dragPositionsRef.current = new Map(map.allNodes.map((item) => [item.id, { ...item.position }]));
    map.setSelectedIds([node.id]);
    setDraggingNodeId(node.id);
    dropParentIdRef.current = null;
  };

  const getDropParent = useCallback((node, event) => {
    if (node.data.locked) return null;
    const position = event && Number.isFinite(event.clientX)
      ? flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      : (() => {
          const current = node.positionAbsolute || node.position;
          return { x: current.x + Number(node.measured?.width || node.style?.width || fallbackNodeWidth(node)) / 2, y: current.y + Number(node.measured?.height || node.style?.height || 76) / 2 };
        })();
    return findDropParent(flow.getNodes(), node.id, position);
  }, [flow]);

  const onNodeDrag = (event, node) => {
    if (dragPositionsRef.current) map.moveSubtree(node.id, node.position, dragPositionsRef.current);
    const parent = getDropParent(node, event);
    dropParentIdRef.current = parent?.id || null;
    setDropTargetId(dropParentIdRef.current);
  };
  const onNodeDragStop = (event, node) => {
    // Keep the highlighted target chosen during dragging. React Flow can
    // report a stale position on the final drag-stop event, notably for large
    // image nodes, even though the target was visibly accepted.
    const parent = map.allNodes.find((item) => item.id === dropParentIdRef.current) || getDropParent(node, event);
    if (parent && map.reparentNode(node.id, parent.id)) {
      toast.success(`Đã nối “${node.data.label || node.data.caption || node.data.note || "ảnh"}” vào “${parent.data.label || parent.data.caption || parent.data.note || "ảnh"}”.`);
    } else {
      // Dragging is only for changing hierarchy. A drop on empty canvas must
      // never leave an item between lanes or over another branch.
      map.arrange("horizontal");
      if (parent) toast.warning("Không thể nối vì note đích đang nằm trong nhánh con của note này.");
    }
    setDropTargetId(null);
    setDraggingNodeId(null);
    dropParentIdRef.current = null;
    dragPositionsRef.current = null;
  };

  const getPreferredPanelPosition = useCallback((panel, canvasRect, size) => {
    const dimensionsFor = (node) => ({
      width: Number(node.measured?.width || node.width || node.style?.width || fallbackNodeWidth(node)),
      height: Number(node.measured?.height || node.height || node.style?.height || (node.type === "image" ? 160 : node.data.imageAssetId ? 76 + Number(node.data.topicImageHeight || 145) : 76)),
    });
    const screenCenterFor = (node) => {
      const dimensions = dimensionsFor(node);
      return flow.flowToScreenPosition({
        x: node.position.x + dimensions.width / 2,
        y: node.position.y + dimensions.height / 2,
      });
    };
    const toLocal = (point) => ({ x: point.x - canvasRect.left, y: point.y - canvasRect.top });
    const placeBeside = (point) => ({ x: point.x + DEFAULT_PANEL_GAP, y: point.y - size.height / 2 });

    if (panel.kind === "topic" || panel.kind === "image") {
      const node = displayNodeById.get(panel.targetId);
      return node ? placeBeside(toLocal(screenCenterFor(node))) : { x: DEFAULT_PANEL_GAP, y: DEFAULT_PANEL_GAP };
    }
    if (panel.kind === "relation") {
      const edge = relationEdges.find((item) => item.id === panel.targetId);
      const source = edge && displayNodeById.get(edge.source);
      const target = edge && displayNodeById.get(edge.target);
      if (source && target) {
        const sourcePoint = toLocal(screenCenterFor(source));
        const targetPoint = toLocal(screenCenterFor(target));
        return placeBeside(sourcePoint.x >= targetPoint.x ? sourcePoint : targetPoint);
      }
    }
    return { x: canvasRect.width - size.width - DEFAULT_PANEL_GAP, y: DEFAULT_PANEL_GAP };
  }, [displayNodeById, flow, relationEdges]);

  const renderPropertyPanel = (panel) => {
    if (panel.kind === "topic") {
      const node = displayNodeById.get(panel.targetId);
      if (!node) return null;
      return <Inspector key={panel.id} node={node} onUpdate={(updates) => updateNodeById(node.id, updates)} onDelete={() => deleteNodeById(node.id)} onHide={() => updateNodeById(node.id, { hidden: true })} onAddImage={() => chooseImage(node.id, "attach")} onFocus={() => { map.setFocusId(node.id); window.setTimeout(() => flow.fitView({ padding: 0.25, duration: 500 }), 40); }} onClose={() => closePropertyPanel(panel.id)} />;
    }
    if (panel.kind === "image") {
      const node = displayNodeById.get(panel.targetId);
      if (!node) return null;
      return <ImageInspector key={panel.id} node={node} onUpdate={(updates, styles) => updateNodeById(node.id, updates, styles)} onAddChild={() => map.addNode(node.id)} onDuplicate={() => duplicateNodeById(node.id)} onDelete={() => deleteNodeById(node.id)} onReplace={() => chooseImage(node.id, "replace")} onClose={() => closePropertyPanel(panel.id)} />;
    }
    if (panel.kind === "relation") {
      const edge = relationEdges.find((item) => item.id === panel.targetId);
      if (!edge) return null;
      return <RelationInspector key={panel.id} edge={edge} onUpdate={(updates) => map.updateRelation(edge.id, updates)} onClearPath={() => map.updateRelation(edge.id, { controlPoint: null })} onDelete={() => { map.deleteCrossLink(edge.id); closePropertyPanel(panel.id); setSelectedEdgeId(null); }} onClose={() => closePropertyPanel(panel.id)} />;
    }
    return <MapInspector key={panel.id} document={map.document} onSettings={(updates) => map.setDocument((document) => ({ ...document, settings: { ...document.settings, ...updates } }))} onAddRoot={map.addRootNode} onExpandAll={() => map.setDocument((document) => ({ ...document, nodes: document.nodes.map((node) => ({ ...node, data: { ...node.data, collapsed: false } })) }))} onCollapseAll={() => map.setDocument((document) => ({ ...document, nodes: document.nodes.map((node) => ({ ...node, data: { ...node.data, collapsed: document.nodes.some((child) => child.data.parentId === node.id) } })) }))} onShowAll={() => map.setDocument((document) => ({ ...document, nodes: document.nodes.map((node) => ({ ...node, data: { ...node.data, hidden: false } })) }))} onClose={() => closePropertyPanel(panel.id)} />;
  };

  return (
    <main className={`mindmap-app theme-${map.document.settings.theme} ${isFileDragging ? "file-dragging" : ""}`}>
      <MapSidebar collapsed={!sidebarOpen} documents={map.documents} activeId={map.document.id} onOpen={map.setActiveId} onCreate={map.createDocument} onDelete={map.deleteDocument} query={query} onQueryChange={setQuery} />
      <section className="workspace-shell">
        <MapToolbar title={map.document.title} saveStatus={map.saveStatus} onTitleChange={(title) => map.setDocument((document) => ({ ...document, title }))} onAddChild={() => map.addNode(map.selectedNode?.id)} onAddSibling={map.addSibling} onAddImage={() => chooseImage(map.selectedNode?.id || null, "connect")} onAddTopicImage={() => { const id = map.addNode(map.selectedNode?.id || map.allNodes.find((node) => !node.data.parentId)?.id, ""); if (id) chooseImage(id, "attach"); }} onCrossLink={() => setCrossLinkSource((value) => value ? null : map.selectedNode?.id)} crossLinkActive={Boolean(crossLinkSource)} onUndo={map.undo} onRedo={map.redo} canUndo={map.canUndo} canRedo={map.canRedo} layout={map.document.layout} relationStyle={map.document.settings.relationStyle} onRelationStyleChange={(relationStyle) => map.setDocument((document) => ({ ...document, settings: { ...document.settings, relationStyle } }))} onArrange={(layout) => { map.arrange(layout); window.setTimeout(() => flow.fitView({ padding: 0.18, duration: 500 }), 40); }} onExportJson={exportJson} onExportPng={exportPng} onExportSvg={exportSvg} onExportPdf={exportPdf} onExportText={exportText} onExportHtml={exportHtml} onPrint={() => window.print()} onToggleSidebar={() => setSidebarOpen((value) => !value)} onToggleOutline={() => { setOutlineOpen((value) => !value); setTeacherOpen(false); setOpenPanels([]); }} onToggleTeacher={() => { setTeacherOpen((value) => !value); setOutlineOpen(false); setOpenPanels([]); }} teacherOpen={teacherOpen} onToggleInspector={() => { if (visibleOpenPanels.length) setOpenPanels([]); else openPropertyPanel(map.selectedNode?.type === "image" ? "image" : map.selectedNode ? "topic" : "map", map.selectedNode?.id || "map"); setOutlineOpen(false); setTeacherOpen(false); }} />
        <div className="canvas-row">
          <div className="canvas-wrap" ref={wrapperRef} style={{ backgroundColor: map.document.settings.background }} onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setIsFileDragging(true); } }} onDragOver={(event) => { event.preventDefault(); const element = event.target.closest?.(".react-flow__node"); setDropTargetId(element?.dataset?.id || null); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setIsFileDragging(false); setDropTargetId(null); } }} onDrop={onCanvasDrop}>
            {isFileDragging && <div className="file-drop-overlay"><ImagePlus /><strong>{dropTargetId || map.selectedNode ? "Thả để tạo ảnh và tự nối với node" : "Thả cạnh một node để tự động kết nối"}</strong><span>PNG, JPG, WEBP, GIF hoặc SVG · tối đa 12 MB</span></div>}
            {crossLinkSource && <div className="crosslink-banner">Chọn note hoặc ảnh đích để tạo cross link <button onClick={() => setCrossLinkSource(null)}><X /></button></div>}
            {searchResults.length > 0 && <div className="search-results"><div><Search /> {searchResults.length} kết quả <button onClick={() => setQuery("")}><X /></button></div>{searchResults.map((node) => <button key={node.id} onClick={() => focusNode(node)}><span>{node.data.emoji || "•"}</span><strong>{node.data.label || node.data.caption || "Image"}</strong></button>)}</div>}
            {map.focusId && <button className="focus-banner" onClick={() => { map.setFocusId(null); flow.fitView({ padding: 0.2 }); }}><Focus /> Đang focus một nhánh <X /></button>}
            <ReactFlow
              nodes={displayNodes}
              edges={relationEdges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={map.onNodesChange}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onMove={refreshPanelAnchors}
              onNodeClick={onNodeClick}
              onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); map.setSelectedIds([]); }}
              onPaneClick={() => { setContextMenu(null); setSelectedEdgeId(null); map.setSelectedIds([]); }}
              onNodeContextMenu={(event, node) => { event.preventDefault(); map.setSelectedIds([node.id]); setSelectedEdgeId(null); setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 280) }); }}
              fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.15} maxZoom={3}
              selectionOnDrag panOnScroll zoomOnPinch nodesConnectable={false} deleteKeyCode={null}
              snapToGrid={map.document.settings.snapToGrid} snapGrid={[20, 20]}
            >
              {map.document.settings.grid !== "none" && <Background variant={map.document.settings.grid === "dots" ? BackgroundVariant.Dots : BackgroundVariant.Lines} gap={22} size={1.2} color="#cbd5e1" />}
              <Controls showInteractive={false} position="bottom-center" />
            </ReactFlow>
            <PropertyPanelLayer containerRef={wrapperRef} panels={visibleOpenPanels} getPreferredPosition={getPreferredPanelPosition} renderPanel={renderPropertyPanel} layoutVersion={panelLayoutVersion} />
            <div className="canvas-quick-actions"><button onClick={() => flow.fitView({ padding: 0.2, duration: 500 })}><Maximize2 /> Fit</button><button onClick={() => importRef.current?.click()}><Upload /> Import</button><button onClick={exportJson}><Download /> JSON</button></div>
            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple hidden onChange={onImageInput} />
          </div>
          {outlineOpen && <OutlinePanel nodes={map.allNodes} mode={outlineMode} onModeChange={setOutlineMode} onSelect={focusNode} onCheck={(id, checked) => updateNodeById(id, { checked })} onReparent={map.reparentNode} onClose={() => setOutlineOpen(false)} />}
          {teacherOpen && <TeacherPanel key={map.document.id} documentId={map.document.id} selectedNode={map.selectedNode} quickCheckRequest={teacherQuickCheck} onClose={() => setTeacherOpen(false)} />}
        </div>
      </section>
      {contextMenu && map.selectedNode?.type !== "image" && <ContextMenu {...contextMenu} isRoot={!map.selectedNode?.data.parentId} onClose={() => setContextMenu(null)} onAddChild={() => { map.addNode(map.selectedNode?.id); setContextMenu(null); }} onAddSibling={() => { map.addSibling(); setContextMenu(null); }} onDuplicate={() => { map.duplicateSelected(); setContextMenu(null); }} onFocus={() => { map.setFocusId(map.selectedNode?.id); setContextMenu(null); }} onDelete={() => { map.deleteSelected(); setContextMenu(null); }} />}
    </main>
  );
};

const MindMapPage = () => {
  const { user, loading } = useAuth();
  if (loading) return <main className="login-page">Đang tải tài khoản…</main>;
  if (!user) return <Navigate to="/login" replace />;
  return <ReactFlowProvider><MindMapWorkspace /></ReactFlowProvider>;
};
export default MindMapPage;
