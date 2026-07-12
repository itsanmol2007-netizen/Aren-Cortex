import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SelectedSymptom } from "../types";

type TagProps = {
  label: string;
  tone?: "blue" | "pink" | "teal" | "violet";
  onRemove: () => void;
  id?: string;
  intensity?: SelectedSymptom["intensity"];
  onIntensityChange?: (intensity: SelectedSymptom["intensity"]) => void;
};

const DOTS: Record<SelectedSymptom["intensity"], string> = {
  mild: "●",
  moderate: "●●",
  severe: "●●●",
};

const INTENSITY_COLOR: Record<SelectedSymptom["intensity"], string> = {
  mild: "#16a34a",
  moderate: "#d97706",
  severe: "#d94040",
};

const INTENSITIES: SelectedSymptom["intensity"][] = ["mild", "moderate", "severe"];

// ── Intensity context menu ────────────────────────────────────────────────────
function IntensityMenu({
  anchor,
  current,
  onSelect,
  onClose,
}: {
  anchor: { x: number; y: number };
  current: SelectedSymptom["intensity"];
  onSelect: (i: SelectedSymptom["intensity"]) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  // Position: just above the click point, clamped to viewport
  const MENU_W = 130;
  const MENU_H = 108; // approx
  const left = Math.min(anchor.x, window.innerWidth - MENU_W - 8);
  const top = Math.max(anchor.y - MENU_H - 6, 8);

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left,
        top,
        width: MENU_W,
        background: "var(--surface, #fff)",
        border: "1px solid var(--line-soft, #e5e7eb)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        padding: "4px 0",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {INTENSITIES.map((level) => {
        const active = level === current;
        return (
          <button
            key={level}
            type="button"
            onClick={() => { onSelect(level); onClose(); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              background: active ? "rgba(99,102,241,0.07)" : "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              color: "var(--text, #111)",
              transition: "background 0.1s",
            }}
            onMouseEnter={e =>
              !active && ((e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)")
            }
            onMouseLeave={e =>
              !active && ((e.currentTarget as HTMLButtonElement).style.background = "none")
            }
          >
            {/* dot indicator */}
            <span
              style={{
                fontSize: "9px",
                letterSpacing: "-1px",
                color: INTENSITY_COLOR[level],
                minWidth: 18,
              }}
            >
              {DOTS[level]}
            </span>
            {/* label */}
            <span style={{ textTransform: "capitalize" }}>{level}</span>
            {/* checkmark */}
            {active && (
              <span
                style={{
                  marginLeft: "auto",
                  color: "var(--blue, #1268e8)",
                  fontSize: 11,
                }}
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

// ── Tag ───────────────────────────────────────────────────────────────────────
export function Tag({
  label,
  tone = "blue",
  onRemove,
  id,
  intensity,
  onIntensityChange,
}: TagProps) {
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onIntensityChange) return;
    e.preventDefault();
    setMenuAnchor({ x: e.clientX, y: e.clientY });
  };

  const handleClick = (e: React.MouseEvent) => {
    // If menu is open, clicks are handled by the menu's outside-click handler
    if (menuAnchor) return;
    onRemove();
  };

  return (
    <>
      <button
        id={id}
        className={`tag tag-${tone}`}
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        aria-label={`${label}${intensity ? ` (${intensity})` : ""} — left-click to remove, right-click to set intensity`}
      >
        <span>{label}</span>
        {intensity && (
          <span
            style={{
              color: INTENSITY_COLOR[intensity],
              fontSize: "9px",
              letterSpacing: "-1px",
              marginLeft: "2px",
            }}
            title={intensity}
          >
            {DOTS[intensity]}
          </span>
        )}
        <X size={14} />
      </button>

      {menuAnchor && onIntensityChange && intensity && (
        <IntensityMenu
          anchor={menuAnchor}
          current={intensity}
          onSelect={onIntensityChange}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </>
  );
}