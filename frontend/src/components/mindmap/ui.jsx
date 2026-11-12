import { useEffect, useRef, useState } from "react";
import { useDismiss } from "@/hooks/useDismiss";
import { Check, X } from "lucide-react";
import { SWATCHES } from "@/mindmap/constants";

/** Toolbar-style button: icon with a small caption underneath. */
export const ToolButton = ({ icon: Icon, label, shortcut, active = false, className = "", children, ...props }) => (
  <button type="button" className={`tool-btn ${active ? "is-active" : ""} ${className}`} title={shortcut ? `${label} (${shortcut})` : label} aria-label={label} aria-pressed={active || undefined} {...props}>
    {Icon && <Icon aria-hidden="true" />}
    <span>{children || label}</span>
  </button>
);

export const IconButton = ({ icon: Icon, label, active = false, className = "", ...props }) => (
  <button type="button" className={`icon-btn ${active ? "is-active" : ""} ${className}`} title={label} aria-label={label} aria-pressed={active || undefined} {...props}>
    <Icon aria-hidden="true" />
  </button>
);

/** Dropdown menu anchored to a trigger. `children` may be a function(close). */
export const Menu = ({ trigger, children, align = "start", className = "", width = 230 }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, () => setOpen(false), ref);
  const close = () => setOpen(false);
  return (
    <div className={`menu-anchor ${className}`} ref={ref}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div className={`menu-popover align-${align}`} role="menu" style={{ width }}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
};

export const MenuItem = ({ icon: Icon, label, hint, danger = false, checked, disabled, onSelect, close }) => (
  <button
    type="button"
    role="menuitem"
    className={`menu-item ${danger ? "is-danger" : ""}`}
    disabled={disabled}
    onClick={() => { onSelect?.(); close?.(); }}
  >
    <span className="menu-item-icon">{checked ? <Check /> : Icon ? <Icon /> : null}</span>
    <span className="menu-item-label">{label}</span>
    {hint && <kbd>{hint}</kbd>}
  </button>
);

export const MenuLabel = ({ children }) => <div className="menu-label">{children}</div>;
export const MenuSeparator = () => <div className="menu-separator" />;

export const Dialog = ({ title, subtitle, icon: Icon, onClose, children, footer, width = 560, className = "" }) => {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <header className="dialog-header">
          {Icon && <span className="dialog-icon"><Icon /></span>}
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng"><X /></button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </section>
    </div>
  );
};

/** Colour picker: automatic, a palette and a custom colour. */
export const ColorField = ({ value, onChange, auto = true, autoLabel = "Tự động", palette = SWATCHES, compact = false }) => (
  <div className={`color-field ${compact ? "is-compact" : ""}`}>
    {auto && (
      <button type="button" className={`swatch swatch-auto ${!value ? "is-active" : ""}`} title={autoLabel} aria-label={autoLabel} onClick={() => onChange("")}>
        <span>A</span>
      </button>
    )}
    {palette.map((color) => (
      <button key={color} type="button" className={`swatch ${value?.toLowerCase() === color ? "is-active" : ""}`} style={{ "--swatch": color }} title={color} aria-label={`Màu ${color}`} onClick={() => onChange(color)} />
    ))}
    <label className="swatch swatch-custom" title="Chọn màu khác">
      <input type="color" value={value || "#2f80ed"} onChange={(event) => onChange(event.target.value)} aria-label="Chọn màu khác" />
    </label>
  </div>
);

export const Segmented = ({ value, options, onChange, ariaLabel }) => (
  <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        className={value === option.value ? "is-active" : ""}
        title={option.title || option.label}
        onClick={() => onChange(option.value)}
      >
        {option.icon ? <option.icon /> : null}{option.label && !option.iconOnly ? <span>{option.label}</span> : null}
      </button>
    ))}
  </div>
);

export const Field = ({ label, hint, children, inline = false }) => (
  <label className={`field ${inline ? "is-inline" : ""}`}>
    <span className="field-label">{label}{hint && <small>{hint}</small>}</span>
    {children}
  </label>
);

export const Toggle = ({ checked, onChange, label, description }) => (
  <label className="toggle-row">
    <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <input type="checkbox" role="switch" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    <i aria-hidden="true" />
  </label>
);

export const Section = ({ title, children, actions }) => (
  <section className="panel-section">
    {(title || actions) && <header><h3>{title}</h3>{actions}</header>}
    {children}
  </section>
);

export const Kbd = ({ children }) => <kbd className="kbd">{children}</kbd>;
