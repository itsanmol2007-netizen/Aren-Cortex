import { Plus, Sparkles } from "lucide-react";
import type { FrequentPick } from "../lib/db";

interface Props {
    picks: FrequentPick[];
    loading: boolean;
    addedCompositionIds: number[];
    onAdd: (pick: FrequentPick) => void;
}

function SkeletonRows() {
    return (
        <div className="fp-skeleton">
            {[0, 1, 2].map((i) => (
                <div key={i} className="fp-skel-row">
                    <div className="fp-skel-body">
                        <div className="fp-skel-badge" />
                        <div className="fp-skel-name" />
                        <div className="fp-skel-sub" />
                    </div>
                    <div className="fp-skel-btn" />
                </div>
            ))}
        </div>
    );
}

export function FrequentPicksPanel({ picks, loading, addedCompositionIds, onAdd }: Props) {
    return (
        <div className="panel fp-panel">
            <div className="section-head">
                <div className="panel-title">
                    <Sparkles size={15} />
                    <span style={{ fontSize: 12, fontWeight: 750 }}>Frequently Prescribed</span>
                </div>
            </div>

            {loading && <SkeletonRows />}

            {!loading && picks.length === 0 && (
                <div className="fp-empty">
                    <div className="fp-empty-icon">
                        <Sparkles size={20} />
                    </div>
                    <p className="fp-empty-title">No companion suggestions yet</p>
                    <p className="fp-empty-hint">
                        Select symptoms to see context-aware picks
                    </p>
                </div>
            )}

            {!loading && picks.length > 0 && (
                <div className="fp-list-wrap">
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
                                        {alreadyAdded
                                            ? <span className="fp-added-tick">✓</span>
                                            : <Plus size={14} />
                                        }
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}