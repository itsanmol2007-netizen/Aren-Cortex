import { X } from "lucide-react";

type TagProps = {
  label: string;
  tone?: "blue" | "pink" | "teal" | "violet";
  onRemove: () => void;
  id?: string;
};

export function Tag({ label, tone = "blue", onRemove, id }: TagProps) {
  return (
    <button id={id} className={`tag tag-${tone}`} type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
      <span>{label}</span>
      <X size={14} />
    </button>
  );
}
