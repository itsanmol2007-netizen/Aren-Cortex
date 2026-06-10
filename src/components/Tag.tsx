import { X } from "lucide-react";
import { useRef } from "react";
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

export function Tag({ label, tone = "blue", onRemove, id, intensity, onIntensityChange }: TagProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = () => {
    if (!onIntensityChange) return;
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      const next: SelectedSymptom["intensity"][] = ["mild", "moderate", "severe"];
      const current = intensity ?? "moderate";
      const nextIndex = (next.indexOf(current) + 1) % next.length;
      onIntensityChange(next[nextIndex]);
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (didLongPress.current) {
      e.preventDefault();
      return;
    }
    onRemove();
  };

  return (
    <button
      id={id}
      className={`tag tag-${tone}`}
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      aria-label={`Remove ${label}`}
    >
      <span>{label}</span>
      {intensity && (
        <span
          style={{ color: INTENSITY_COLOR[intensity], fontSize: "9px", letterSpacing: "-1px", marginLeft: "2px" }}
          title={intensity}
        >
          {DOTS[intensity]}
        </span>
      )}
      <X size={14} />
    </button>
  );
}