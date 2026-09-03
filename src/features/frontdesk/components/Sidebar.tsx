import type { DBDoctor } from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";
import { SummaryCard } from "./SummaryCard";
import { DoctorsCard } from "./DoctorsCard";
import { DoctorRequestsCard } from "./DoctorRequestsCard";

type Props = {
    doctors: DBDoctor[];
    visits: TodayVisit[];
    now: Date;
    hospitalId: string | null;
};

export function Sidebar({ doctors, visits, now, hospitalId }: Props) {
    return (
        // ONE panel, full height — the same white surface language as the
        // QueuePanel on the left, so both columns are framed and end on the
        // same line. The three cards are SECTIONS of this panel (hairline
        // between them), not separate cards floating over a void. Whatever
        // height is left below the last section is quiet panel space, exactly
        // like the QueuePanel's own empty area — nothing is stretched.
        // Safety-net scroll if the sections ever exceed the column height.
        <div className="flex h-full min-h-0 flex-col divide-y divide-[#e1e3ec] overflow-y-auto rounded-[13px] border border-[#e7e9f0] bg-white shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <SummaryCard visits={visits} now={now} />
            <DoctorsCard doctors={doctors} visits={visits} now={now} />
            {/* Last section grows into whatever height is left — its centred
                empty state then sits in the middle of that space instead of
                leaving a slab of nothing below it. */}
            <DoctorRequestsCard hospitalId={hospitalId} />
        </div>
    );
}
