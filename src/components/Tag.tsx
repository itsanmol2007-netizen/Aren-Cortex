import { X } from "lucide-react";

type TagProps = {
  label: string;
  tone?: "blue" | "pink" | "teal" | "violet";
  onRemove: () => void;
};

export function Tag({ label, tone = "blue", onRemove }: TagProps) {
  return (
    <button className={`tag tag-${tone}`} type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
      <span>{label}</span>
      <X size={14} />
    </button>
  );
}
