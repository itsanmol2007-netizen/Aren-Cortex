import type { VisitStatus } from "./types/frontdesk";
import type { StringKey } from "./i18n/strings";

// Ambient row-tint gradients, colors and chip tokens per visit status.
// Central lookup so VisitRow / QueuePanel tabs / VisitDetailModal all agree
// on the same palette without re-deriving it. This is status-domain styling
// (intrinsic to the queue), not specialty/clinic-mode branching.
type StatusTint = {
    label: string;
    // i18n key for the status word — components render t(labelKey); `label`
    // stays as an English fallback for non-React callers/logging.
    labelKey: StringKey;
    borderColor: string;
    dotColor: string;
    textClass: string;
    chipBg: string;
    background: string;
    backgroundHover: string;
};

const AMBER = "#c9791a";
const BLUE = "#2f6bed";
const GREEN = "#1c8a4d";
const FAINT = "#a8aeba";

const NEUTRAL: StatusTint = {
    label: "Cancelled",
    labelKey: "stCancelled",
    borderColor: FAINT,
    dotColor: FAINT,
    textClass: "text-[#8a91a0]",
    chipBg: "bg-[#eef0f5]",
    background: "none",
    backgroundHover: "none",
};

export const STATUS_TINT: Record<VisitStatus, StatusTint> = {
    waiting: {
        label: "Waiting",
        labelKey: "stWaiting",
        borderColor: AMBER,
        dotColor: AMBER,
        textClass: "text-[#a9741f]",
        chipBg: "bg-[#fbeed9]",
        background:
            "radial-gradient(120% 140% at 0% 0%, rgba(224,145,32,0.05) 0%, rgba(224,145,32,0) 42%), linear-gradient(90deg, rgba(224,145,32,0.035) 0%, rgba(224,145,32,0.012) 30%, rgba(224,145,32,0) 55%)",
        backgroundHover:
            "radial-gradient(120% 140% at 0% 0%, rgba(224,145,32,0.07) 0%, rgba(224,145,32,0) 44%), linear-gradient(90deg, rgba(224,145,32,0.055) 0%, rgba(224,145,32,0.02) 32%, rgba(224,145,32,0) 58%)",
    },
    serving: {
        label: "In Consultation",
        labelKey: "stConsult",
        borderColor: BLUE,
        dotColor: BLUE,
        textClass: "text-[#3a5da8]",
        chipBg: "bg-[#e9f0fe]",
        background:
            "radial-gradient(120% 140% at 0% 0%, rgba(47,107,237,0.045) 0%, rgba(47,107,237,0) 42%), linear-gradient(90deg, rgba(47,107,237,0.032) 0%, rgba(47,107,237,0.011) 30%, rgba(47,107,237,0) 55%)",
        backgroundHover:
            "radial-gradient(120% 140% at 0% 0%, rgba(47,107,237,0.065) 0%, rgba(47,107,237,0) 44%), linear-gradient(90deg, rgba(47,107,237,0.05) 0%, rgba(47,107,237,0.018) 32%, rgba(47,107,237,0) 58%)",
    },
    completed: {
        label: "Completed",
        labelKey: "stCompleted",
        borderColor: GREEN,
        dotColor: GREEN,
        textClass: "text-[#347d55]",
        chipBg: "bg-[#e4f5eb]",
        background:
            "radial-gradient(120% 140% at 0% 0%, rgba(28,157,85,0.042) 0%, rgba(28,157,85,0) 42%), linear-gradient(90deg, rgba(28,157,85,0.03) 0%, rgba(28,157,85,0.01) 30%, rgba(28,157,85,0) 55%)",
        backgroundHover:
            "radial-gradient(120% 140% at 0% 0%, rgba(28,157,85,0.06) 0%, rgba(28,157,85,0) 44%), linear-gradient(90deg, rgba(28,157,85,0.046) 0%, rgba(28,157,85,0.016) 32%, rgba(28,157,85,0) 58%)",
    },
    discarded: { ...NEUTRAL, label: "Cancelled", labelKey: "stCancelled" },
    referred: { ...NEUTRAL, label: "Referred", labelKey: "stReferred" },
};

export function tintFor(status: string): StatusTint {
    return STATUS_TINT[status as VisitStatus] ?? NEUTRAL;
}
