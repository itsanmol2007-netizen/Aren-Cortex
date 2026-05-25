import { Loader2, Plus, Sparkles } from "lucide-react";
import type { FrequentPick } from "../lib/db";

interface Props {
    picks: FrequentPick[];
    loading: boolean;
    addedCompositionIds: number[];
    onAdd: (pick: FrequentPick) => void;
}

export function FrequentPicksPanel({ picks, loading, addedCompositionIds, onAdd }: Props) {
    return (
        <div className="panel fp-panel">
            <div className="section-head">
                <div className="panel-title">
                    <Sparkles size={15} />
                    <span style={{ fontSize: 12, fontWeight: 750 }}>Frequent Picks</span>
                </div>
            </div>

            {loading && (
                <div className="fp-loading">
                    <Loader2 size={14} className="spin" />
                    <span>Loading suggestions…</span>
                </div>
            )}

            {!loading && picks.length === 0 && (
                <div className="fp-empty">
                    <div className="fp-empty-icon">
                        <Sparkles size={20} />
                    </div>
                    <p className="fp-empty-title">No companion suggestions</p>
                    <p className="fp-empty-hint">
                        Select symptoms to see context-aware picks
                    </p>
                </div>
            )}

            {!loading && picks.length > 0 && (
                <div className="fp-list">
                    {picks.map((pick) => {
                        const alreadyAdded = addedCompositionIds.includes(pick.composition_id);
                        return (
                            <div
                                key={`${pick.composition_id}-${pick.medicine_id}`}
                                className={`fp-row${alreadyAdded ? " fp-row--added" : ""}`}
                            >
                                <div className="fp-row-body">
                                    <div className="fp-label-badge">{pick.hint_label}</div>
                                    <strong className="fp-med-name">{pick.medicine_name}</strong>
                                    <span className="fp-comp-name">{pick.composition_name}</span>
                                    {pick.clinical_reason && (
                                        <p className="fp-reason">{pick.clinical_reason}</p>
                                    )}
                                </div>
                                <button
                                    className="fp-add-btn"
                                    type="button"
                                    disabled={alreadyAdded}
                                    onClick={() => !alreadyAdded && onAdd(pick)}
                                    aria-label={alreadyAdded ? "Already added" : `Add ${pick.medicine_name}`}
                                >
                                    {alreadyAdded ? (
                                        <span className="fp-added-tick">✓</span>
                                    ) : (
                                        <Plus size={14} />
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}