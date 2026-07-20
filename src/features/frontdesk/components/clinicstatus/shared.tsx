import type { ServiceState } from "../../clinicStatus/model";
import type { StringKey } from "../../i18n/strings";
import { useT } from "../../i18n/i18n";

// Shared state vocabulary for Clinic Status — one lookup so the summary,
// detailed rows, tiles and the service-detail modal all agree on how each
// health state looks and reads. Semantic color only (green/amber/red/neutral),
// per the frozen rule that violet/pink never label data.

type StateMeta = {
    labelKey: StringKey;
    dot: string;
    text: string;
    bg: string;
    border: string;
    softBg: string;
};

export const STATE_META: Record<ServiceState, StateMeta> = {
    operational: {
        labelKey: "csStateOperational",
        dot: "#27a35f",
        text: "#1c7a45",
        bg: "rgba(39,163,95,0.10)",
        border: "rgba(39,163,95,0.24)",
        softBg: "rgba(39,163,95,0.07)",
    },
    attention: {
        labelKey: "csStateAttention",
        dot: "#d38a2c",
        text: "#b06f14",
        bg: "rgba(201,121,26,0.11)",
        border: "rgba(201,121,26,0.26)",
        softBg: "rgba(201,121,26,0.07)",
    },
    offline: {
        labelKey: "csStateOffline",
        dot: "#d9483f",
        text: "#c0352d",
        bg: "rgba(210,59,52,0.10)",
        border: "rgba(210,59,52,0.24)",
        softBg: "rgba(210,59,52,0.06)",
    },
    notConfigured: {
        labelKey: "csStateNotConfigured",
        dot: "#a8aeba",
        text: "#6b7280",
        bg: "#f3f4f7",
        border: "#e7e9f0",
        softBg: "#f7f8fb",
    },
};

// A compact status pill: dot + label. Used on detailed service rows.
export function StateChip({ state }: { state: ServiceState }) {
    const t = useT();
    const m = STATE_META[state];
    return (
        <span
            className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11.5px] font-bold"
            style={{ background: m.bg, color: m.text, border: `1px solid ${m.border}` }}
        >
            <span className="h-[6px] w-[6px] rounded-full" style={{ background: m.dot }} />
            {t(m.labelKey)}
        </span>
    );
}
