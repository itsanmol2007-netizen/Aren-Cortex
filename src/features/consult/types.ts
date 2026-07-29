import type { IntentType } from "../../lib/synapse/engine";
import type { Medicine } from "../../lib/synapse/brands";

/**
 * One entry point for taking a suggestion, whatever kind it is.
 *
 * Every intent type accepts the same way because the decision log records them
 * all the same way. Where each type LANDS differs — a medicine becomes a
 * prescription line, a test an order, advice a line on the note — but the
 * record of "the doctor took this" is one shape, and that is what the learning
 * loop reads.
 */
export interface AcceptPayload {
    intentId: number;
    type: IntentType;
    label: string;
    refTable: string | null;
    refId: number | null;
    /** the brand chosen for a medicine intent, when one exists */
    medicine: Medicine | null;
    /** true when the doctor reached this by searching, not from the ranked list */
    viaSearch: boolean;
    /** true when this was hard-warned and the doctor acknowledged it */
    overridden: boolean;
    /**
     * True only when the doctor picked a brand that was NOT the default.
     * Accepting the default must not teach the brand model — that would make
     * the model reinforce its own output.
     */
    brandDeliberate?: boolean;
}
