import { memo } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import { ChevronDown, ChevronRight, ImageOff, Lock, StickyNote } from "lucide-react";

const ImageNode = memo(({ data, selected }) => (
  <div className={`image-node ${selected ? "selected" : ""}`} style={{ transform: `rotate(${data.rotation || 0}deg)`, zIndex: data.zIndex || 1, "--branch-color": data.branchColor }}>
    <Handle id="target-left" type="target" position={Position.Left} className="image-handle" />
    <Handle id="source-left" type="source" position={Position.Left} className="image-handle" />
    <NodeResizer isVisible={selected && !data.locked} minWidth={80} minHeight={60} keepAspectRatio onResizeStart={data.onTransformStart} onResizeEnd={(_, size) => data.onResizeEnd?.(size)} lineClassName="image-resizer-line" handleClassName="image-resizer-handle" />
    {data.note && <div className="image-note"><StickyNote /> <span>{data.note}</span></div>}
    <div className="image-media">
      {data.assetUrl ? <img src={data.assetUrl} alt={data.caption || data.assetName || "Mind map image"} draggable="false" /> : <div className="image-missing"><ImageOff /> Không tìm thấy ảnh</div>}
      {data.caption && <div className="image-caption">{data.caption}</div>}
      {data.locked && <span className="image-lock"><Lock /></span>}
    </div>
    {data.childCount > 0 && (
      <button className="node-collapse image-collapse nodrag" aria-label={data.collapsed ? "Mở nhánh ảnh" : "Thu gọn nhánh ảnh"} onClick={() => data.onUpdate?.({ collapsed: !data.collapsed })}>
        {data.collapsed ? <ChevronRight /> : <ChevronDown />}
        <span>{data.childCount}</span>
      </button>
    )}
    <Handle id="target-right" type="target" position={Position.Right} className="image-handle" />
    <Handle id="source-right" type="source" position={Position.Right} className="image-handle" />
  </div>
));

ImageNode.displayName = "ImageNode";
export default ImageNode;
