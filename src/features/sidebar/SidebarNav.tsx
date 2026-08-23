import {
    Users,
    MessageSquare,
    Stethoscope,
    Building2,
    HelpCircle,
    Settings,
    Syringe,
} from "lucide-react";

// ---------------------------------------------------------------------------
// SIDEBAR NAV — six destinations, not fifteen.
//
// Rebuilt 2026-08-23. Anmol's brief: "don't create a page merely because a
// feature exists — create a page only when the user has a distinct
// recurring job to perform there." The old nav (Patients, Prescriptions,
// Investigations, Communication, Practice with 4 sub-items, Clinic, Support,
// Settings — 11 destinations once the Practice submenu is counted) had
// pages for FEATURES, not jobs. "Prescriptions" wasn't a distinct job — a
// doctor doesn't go BROWSE prescriptions as a task; they write one during a
// consult and, occasionally, look one up for a specific patient, which is
// already the Patient Detail page's job. Same reasoning killed
// "Investigations" and the Practice submenu (Commonly Used Meds/Pref Labs/
// Fav Investigations/Quick Presets — these are what Practice IS, not four
// separate destinations to reach it through).
//
// The six real jobs, per Anmol's spec:
//   Consult        — do clinical work on the current patient (action, not a page)
//   Patients       — find, recognize, navigate to a patient
//   Communication  — the messaging workflow around clinical care
//   Practice       — configure how this doctor practices (meds/labs/templates)
//   Clinic         — configure the clinic itself (staff/hours/operations)
//   Settings       — account/system configuration
// Help & Support sits below a divider as a small utility, not a nav
// destination with equal visual weight — it isn't a job, it's an escape
// hatch.
// ---------------------------------------------------------------------------

export type SidebarPage =
    | "patients"
    | "communication"
    | "practice"
    | "clinic"
    | "settings"
    | "support";

type NavItem =
    | {
        type: "action";
        label: string;
        icon: React.ReactNode;
        onClick: () => void;
    }
    | {
        type: "divider";
    }
    | {
        type: "page";
        label: string;
        icon: React.ReactNode;
        page: SidebarPage;
        /** Small, muted treatment — Help & Support only. */
        variant?: "utility";
    };

type SidebarNavProps = {
    activePage: SidebarPage | null;
    onNavigate: (page: SidebarPage) => void;
    onConsult: () => void;
};

export function SidebarNav({ activePage, onNavigate, onConsult }: SidebarNavProps) {
    const items: NavItem[] = [
        {
            type: "action",
            label: "Consult",
            icon: <Syringe size={15} />,
            onClick: onConsult,
        },
        {
            type: "page",
            label: "Patients",
            icon: <Users size={14} />,
            page: "patients",
        },
        {
            type: "page",
            label: "Communication",
            icon: <MessageSquare size={14} />,
            page: "communication",
        },
        { type: "divider" },
        {
            type: "page",
            label: "Practice",
            icon: <Stethoscope size={14} />,
            page: "practice",
        },
        {
            type: "page",
            label: "Clinic",
            icon: <Building2 size={14} />,
            page: "clinic",
        },
        { type: "divider" },
        {
            type: "page",
            label: "Settings",
            icon: <Settings size={14} />,
            page: "settings",
        },
        { type: "divider" },
        {
            type: "page",
            label: "Help & Support",
            icon: <HelpCircle size={13} />,
            page: "support",
            variant: "utility",
        },
    ];

    return (
        <nav>
            {items.map((item, idx) => {
                if (item.type === "divider") {
                    return <div key={`div-${idx}`} className="sidebar-divider" />;
                }

                if (item.type === "action") {
                    return (
                        <button
                            key={`act-${idx}`}
                            type="button"
                            className="sidebar-nav-item variant-action"
                            onClick={item.onClick}
                        >
                            <span className="sidebar-nav-icon">{item.icon}</span>
                            {item.label}
                        </button>
                    );
                }

                // type === "page"
                return (
                    <button
                        key={`page-${idx}`}
                        type="button"
                        className={`sidebar-nav-item${activePage === item.page ? " is-active" : ""}${item.variant === "utility" ? " variant-utility" : ""}`}
                        onClick={() => onNavigate(item.page)}
                    >
                        <span className="sidebar-nav-icon">{item.icon}</span>
                        {item.label}
                    </button>
                );
            })}
        </nav>
    );
}
