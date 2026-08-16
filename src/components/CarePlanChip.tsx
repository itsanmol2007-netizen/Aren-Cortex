import { Plus, Target } from "lucide-react";
import type { CarePlanWithProgress } from "../lib/db";

type CarePlanChipProps = {
    plan: CarePlanWithProgress | null;
    loading: boolean;
    onClick: () => void;
};

function progressLabel(plan: CarePlanWithProgress): string | null {
    if (plan.target_visit_count) {
        return `${plan.linked_visit_count}/${plan.target_visit_count} visits`;
    }
    if (plan.target_date) {
        const d = new Date(plan.target_date);
        return `Review by ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
    }
    return null;
}

/**
 * Lives at the end of the vitals bar — the one existing strip in the consult
 * workspace that's already scoped to "context for this visit." Deliberately
 * not new header chrome: general OPD barely uses care plans, so this earns
 * a pill in an existing row, not a dedicated surface.
 */
export function CarePlanChip({ plan, loading, onClick }: CarePlanChipProps) {
    if (loading) {
        return (
            <div className="care-plan-chip is-loading" aria-hidden="true">
                <Target size={12} />
                <span>Plan…</span>
            </div>
        );
    }

    if (!plan) {
        return (
            <button type="button" className="care-plan-chip is-empty" onClick={onClick}>
                <Plus size={12} />
                <span>Care plan</span>
            </button>
        );
    }

    const progress = progressLabel(plan);
    return (
        <button type="button" className="care-plan-chip is-active" onClick={onClick} title={plan.goal}>
            <Target size={12} />
            <span className="care-plan-chip-goal">{plan.goal}</span>
            {progress && <span className="care-plan-chip-progress">{progress}</span>}
        </button>
    );
}
