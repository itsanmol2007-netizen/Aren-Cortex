import type { DBDoctor } from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";
import { SummaryCard } from "./SummaryCard";
import { DoctorsCard } from "./DoctorsCard";
import { DoctorRequestsCard } from "./DoctorRequestsCard";

type Props = {
    doctors: DBDoctor[];
    visits: TodayVisit[];
    now: Date;
    hospitalId: string;
};

export function Sidebar({ doctors, visits, now, hospitalId }: Props) {
    return (
        // Safety-net scroll: if the three cards ever exceed the column height,
        // they scroll here instead of overflowing the constrained page chain.
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
            <SummaryCard visits={visits} now={now} />
            <DoctorsCard doctors={doctors} visits={visits} now={now} />
            <DoctorRequestsCard hospitalId={hospitalId} />
        </div>
    );
}
