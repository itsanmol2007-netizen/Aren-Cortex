import { Pill } from "lucide-react";
import type { PrescriptionMedicine } from "../types";

interface Props {
    medicines: PrescriptionMedicine[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onRemove: (id: string) => void;
}

export function SelectedMedicinesBar({ medicines, selectedId, onSelect, onRemove }: Props) {
    if (medicines.length === 0) {
        return (
            <div className="smb-empty">
                <Pill size={13} />
                <span>No medicines added yet — select from the list above</span>
            </div>
        );
    }

    return (
        <div className="smb-bar">
            <div className="smb-label">
                <Pill size={12} />
                <span>Prescription</span>
                <span className="smb-count">{medicines.length}</span>
            </div>
            <div className="smb-scroll">
                {medicines.map((m) => (
                    <button
                        key={m.id}
                        type="button"
                        className={`smb-chip${selectedId === m.id ? " smb-chip--selected" : ""}`}
                        onClick={() => onSelect(m.id)}
                        title={`${m.name} · ${m.dosage} · ${m.frequency}`}
                    >
                        <span className="smb-chip-name">{m.name}</span>
                        <span className="smb-chip-meta">
                            {m.dosage} · {m.frequency}
                        </span>
                        <span
                            className="smb-chip-remove"
                            role="button"
                            tabIndex={0}
                            aria-label={`Remove ${m.name}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove(m.id);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    onRemove(m.id);
                                }
                            }}
                        >
                            ×
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}