import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { useDoctorRequests } from "../hooks/useDoctorRequests";
import { useT } from "../i18n/i18n";
import { timeAgo } from "../utils";

// Real doctor→reception requests, read live from the database (see
// useDoctorRequests). No more simulator: when the doctor sends a request it
// appears here with a gentle chime; acknowledging clears it in the database.
// Until the `doctor_requests` table exists this simply shows the calm "no
// requests" state (see docs/Supabase Wiring TODO.md).

export function DoctorRequestsCard({ hospitalId }: { hospitalId: string | null }) {
    const t = useT();
    const { requests, acknowledge } = useDoctorRequests(hospitalId);

    const ack = (id: string) => {
        void acknowledge(id);
        toast(t("toastAck"));
    };

    const active = requests.length > 0;

    return (
        <div
            className={`relative flex min-h-0 flex-1 flex-col p-[16px] ${active ? "border-l-2 border-l-[#c9791a] bg-[rgba(224,145,32,0.03)]" : ""}`}
        >
            <h3 className="m-0 mb-[10px] flex items-center gap-[6px] text-[13.5px] font-bold text-[#161d29]">
                <Bell size={14} className="text-[#7c5cf0]" />
                {t("requestsTitle")}
            </h3>

            {!active && (
                // Centred in whatever height the section grew into — no slab of
                // empty white below it.
                <div className="flex flex-1 flex-col items-center justify-center gap-[3px] py-[10px] text-center">
                    <div className="mb-[7px] flex h-11 w-11 items-center justify-center rounded-full text-[#8b7fd4]" style={{ background: "#f4f1fe" }}>
                        <Bell size={19} />
                    </div>
                    <p className="m-0 text-[13px] font-semibold text-[#374151]">{t("noRequests")}</p>
                    <p className="m-0 mt-[1px] text-[11px] text-[#a8aeba]">{t("requestsSub")}</p>
                </div>
            )}

            {requests.map((r) => (
                <div
                    key={r.id}
                    className="aren-rise aren-pulse mb-[7px] flex items-center gap-[9px] rounded-[8px] border border-[#fbeed9] bg-[rgba(224,145,32,0.06)] p-[9px_10px]"
                >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[#fbeed9] text-[#c9791a]">
                        <Bell size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-[6px] text-[10px] font-semibold text-[#8a91a0]">
                            <span className="truncate">{r.doctor_name}</span>
                            <span className="shrink-0 text-[#c4c9d3]">·</span>
                            <span className="shrink-0 tabular-nums">{timeAgo(new Date(r.created_at).toISOString())}</span>
                        </div>
                        <div className="mt-[1px] text-[12px] font-semibold text-[#161d29]">{r.text}</div>
                    </div>
                    <button
                        onClick={() => ack(r.id)}
                        aria-label={t("toastAck")}
                        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border border-[#e4e7ee] bg-white text-[#1c8a4d] transition-colors hover:bg-[#e4f5eb] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
                    >
                        <Check size={13} />
                    </button>
                </div>
            ))}
        </div>
    );
}
