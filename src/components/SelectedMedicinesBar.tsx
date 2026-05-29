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
            <div className="smb-header">
                <div className="smb-label">
                    <Pill size={12} />
                    <span>Prescription</span>
                </div>
                <span className="smb-count">{medicines.length}</span>
            </div>
            <div className="smb-grid">
                {medicines.map((m) => (
                    <button
                        key={m.id}
                        type="button"
                        className={`smb-card${selectedId === m.id ? " smb-card--selected" : ""}`}
                        onClick={() => onSelect(m.id)}
                    >
                        <div className="smb-card-top">
                            <span className="smb-card-name">{m.name}</span>
                            <span
                                className="smb-card-remove"
                                role="button"
                                tabIndex={0}
                                aria-label={`Remove ${m.name}`}
                                onClick={(e) => { e.stopPropagation(); onRemove(m.id); }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation(); onRemove(m.id);
                                    }
                                }}
                            >×</span>
                        </div>
                        {m.composition && (
                            <span className="smb-card-comp">{m.composition}</span>
                        )}
                        <div className="smb-card-meta">
                            {m.dosage && (
                                <span className="smb-meta-pill">{m.dosage}</span>
                            )}
                            {m.frequency && (
                                <span className="smb-meta-pill">{m.frequency}</span>
                            )}
                            {m.duration && (
                                <span className="smb-meta-pill">{m.duration}</span>
                            )}
                        </div>
                        {m.instructions && (
                            <span className="smb-card-instructions">{m.instructions}</span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}