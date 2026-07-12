import type { DBDoctor } from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";
import { SummaryCard } from "./SummaryCard";
import { DoctorsCard } from "./DoctorsCard";
import { DoctorRequestsCard } from "./DoctorRequestsCard";

type Props = {
    doctors: DBDoctor[];
    visits: TodayVisit[];
};

export function Sidebar({ doctors, visits }: Props) {
    return (
        <div>
            <SummaryCard visits={visits} />
            <DoctorsCard doctors={doctors} visits={visits} />
            <DoctorRequestsCard />
        </div>
    );
}
