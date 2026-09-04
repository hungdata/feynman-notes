import { Eye, Grid3X3, Link2, Map, Plus, UnfoldVertical, X } from "lucide-react";

const MapInspector = ({ document, onSettings, onAddRoot, onExpandAll, onCollapseAll, onShowAll, onClose }) => (
  <aside className="inspector map-inspector">
    <div className="inspector-heading"><div><span>DOCUMENT</span><strong><Map /> Mind map</strong></div><button onClick={onClose}><X /></button></div>
    <label>Theme<select value={document.settings.theme} onChange={(event) => onSettings({ theme: event.target.value })}><option value="clean-light">Clean Light</option><option value="pastel">Pastel</option><option value="professional">Professional</option><option value="monochrome">Monochrome</option><option value="dark-neon">Dark Neon</option></select></label>
    <label>Màu nền<input type="color" value={document.settings.background} onChange={(event) => onSettings({ background: event.target.value })} /></label>
    <label><span className="label-with-icon"><Grid3X3 /> Canvas grid</span><select value={document.settings.grid} onChange={(event) => onSettings({ grid: event.target.value })}><option value="dots">Dots</option><option value="lines">Lines</option><option value="none">None</option></select></label>
    <label className="checkbox-field"><input type="checkbox" checked={document.settings.snapToGrid} onChange={(event) => onSettings({ snapToGrid: event.target.checked })} /><span><strong>Snap to grid</strong><small>Căn node theo lưới 20px khi kéo.</small></span></label>
    <label><span className="label-with-icon"><Link2 /> Connection mặc định</span><select value={document.settings.relationStyle} onChange={(event) => onSettings({ relationStyle: event.target.value })}><option value="curved">Curved</option><option value="straight">Straight</option><option value="rounded">Rounded</option><option value="angled">Angled</option></select></label>
    <button className="wide-secondary" onClick={onAddRoot}><Plus /> Thêm Central Theme</button>
    <div className="image-action-grid"><button onClick={onExpandAll}><UnfoldVertical /> Expand all</button><button onClick={onCollapseAll}><UnfoldVertical /> Collapse all</button><button onClick={onShowAll}><Eye /> Show hidden</button></div>
  </aside>
);

export default MapInspector;
