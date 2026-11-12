import { memo } from "react";
import { NodeResizer } from "@xyflow/react";
import { ImageOff, Lock, StickyNote } from "lucide-react";
import { NodeHandles } from "./TopicNode";

const ImageNode = memo(({ data, selected }) => (
  <div
    className={`image-node ${selected ? "is-selected" : ""} ${data.dropTarget ? "is-drop-target" : ""}`}
    style={{ transform: `rotate(${data.rotation || 0}deg)`, zIndex: data.zIndex || 1, "--branch-color": data.view?.branchColor }}
  >
    <NodeHandles />
    <NodeResizer
      isVisible={selected && !data.locked}
      minWidth={80}
      minHeight={60}
      keepAspectRatio
      onResizeStart={data.onTransformStart}
      onResizeEnd={(_, size) => data.onResizeEnd?.(size)}
      lineClassName="image-resizer-line"
      handleClassName="image-resizer-handle"
    />
    {data.note && <div className="image-note"><StickyNote /> <span>{data.note}</span></div>}
    <div className="image-media">
      {data.assetUrl ? <img src={data.assetUrl} alt={data.caption || data.assetName || "Ảnh trong mind map"} draggable="false" /> : <div className="image-missing"><ImageOff /> Không tìm thấy ảnh</div>}
      {data.caption && <div className="image-caption">{data.caption}</div>}
      {data.locked && <span className="image-lock"><Lock /></span>}
    </div>
    {data.childCount > 0 && (
      <button
        type="button"
        className={`topic-collapse nodrag ${data.collapsed ? "is-collapsed" : ""}`}
        aria-label={data.collapsed ? "Mở nhánh ảnh" : "Thu gọn nhánh ảnh"}
        onClick={(event) => { event.stopPropagation(); data.onUpdate?.({ collapsed: !data.collapsed }); }}
      >
        {data.collapsed ? data.childCount : "−"}
      </button>
    )}
  </div>
));

ImageNode.displayName = "ImageNode";
export default ImageNode;
