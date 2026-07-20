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

export function DoctorRequestsCard({ hospitalId }: { hospitalId: string }) {
    const t = useT();
    const { requests, acknowledge } = useDoctorRequests(hospitalId);

    const ack = (id: string) => {
        void acknowledge(id);
        toast(t("toastAck"));
    };

    const active = requests.length > 0;

    return (
        <div
            className={`relative shrink-0 overflow-hidden rounded-[13px] border bg-white p-4 pt-[18px] shadow-[0_1px_2px_rgba(20,30,50,0.05)] ${active ? "border-[#e4e7ee] border-l-2 border-l-[#c9791a] bg-[rgba(224,145,32,0.03)]" : "border-[#e4e7ee]"
                }`}
        >
            <div className="absolute inset-x-0 top-0 h-px bg-white/60" />
            <h3 className="m-0 mb-3 flex items-center gap-[7px] text-[14px] font-bold text-[#161d29]">
                <Bell size={15} className="text-[#7c5cf0]" />
                {t("requestsTitle")}
            </h3>

            {!active && (
                <div className="flex flex-col items-center py-2 pb-4 text-center">
                    <div className="mb-[9px] flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f1fe] text-[#9d8df1]">
                        <Bell size={19} />
                    </div>
                    <p className="m-0 text-[13px] font-semibold text-[#374151]">{t("noRequests")}</p>
                    <p className="m-0 mt-[2px] text-[11.5px] text-[#a8aeba]">{t("requestsSub")}</p>
                </div>
            )}

            {requests.map((r) => (
                <div
                    key={r.id}
                    className="aren-rise aren-pulse mb-2 flex items-center gap-[11px] rounded-[9px] border border-[#fbeed9] bg-[rgba(224,145,32,0.06)] p-[11px_12px]"
                >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fbeed9] text-[#c9791a]">
                        <Bell size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-[6px] text-[11px] font-semibold text-[#8a91a0]">
                            <span className="truncate">{r.doctor_name}</span>
                            <span className="shrink-0 text-[#c4c9d3]">·</span>
                            <span className="shrink-0 tabular-nums">{timeAgo(new Date(r.created_at).toISOString())}</span>
                        </div>
                        <div className="mt-[1px] text-[13px] font-semibold text-[#161d29]">{r.text}</div>
                    </div>
                    <button
                        onClick={() => ack(r.id)}
                        aria-label={t("toastAck")}
                        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-[#e4e7ee] bg-white text-[#1c8a4d] transition-colors hover:bg-[#e4f5eb] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)]"
                    >
                        <Check size={15} />
                    </button>
                </div>
            ))}
        </div>
    );
}
