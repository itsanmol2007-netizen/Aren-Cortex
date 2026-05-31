import { useState } from "react";
import {
    Users,
    FileText,
    FlaskConical,
    MessageSquare,
    Stethoscope,
    Building2,
    HelpCircle,
    Settings,
    ChevronRight,
    Pill,
    TestTube,
    Star,
    Layers,
    Syringe,
} from "lucide-react";

export type SidebarPage =
    | "patients"
    | "prescriptions"
    | "investigations"
    | "communication"
    | "practice"
    | "clinic"
    | "support"
    | "settings";

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
        type: "section";
        label: string;
    }
    | {
        type: "page";
        label: string;
        icon: React.ReactNode;
        page: SidebarPage;
        soon?: boolean;
    }
    | {
        type: "parent";
        label: string;
        icon: React.ReactNode;
        page: SidebarPage;
        children: {
            label: string;
            icon: React.ReactNode;
            page: SidebarPage;
            soon?: boolean;
        }[];
    };

type SidebarNavProps = {
    activePage: SidebarPage | null;
    onNavigate: (page: SidebarPage) => void;
    onConsult: () => void;
};

export function SidebarNav({ activePage, onNavigate, onConsult }: SidebarNavProps) {
    const [practiceOpen, setPracticeOpen] = useState(false);

    const items: NavItem[] = [
        {
            type: "action",
            label: "Consult",
            icon: <Syringe size={15} />,
            onClick: onConsult,
        },
        { type: "divider" },
        {
            type: "page",
            label: "Patients",
            icon: <Users size={14} />,
            page: "patients",
            soon: true,
        },
        {
            type: "page",
            label: "Prescriptions",
            icon: <FileText size={14} />,
            page: "prescriptions",
            soon: true,
        },
        {
            type: "page",
            label: "Investigations",
            icon: <FlaskConical size={14} />,
            page: "investigations",
            soon: true,
        },
        { type: "divider" },
        {
            type: "page",
            label: "Communication",
            icon: <MessageSquare size={14} />,
            page: "communication",
            soon: true,
        },
        { type: "divider" },
        {
            type: "parent",
            label: "Practice",
            icon: <Stethoscope size={14} />,
            page: "practice",
            children: [
                {
                    label: "Commonly Used Meds",
                    icon: <Pill size={12} />,
                    page: "practice",
                    soon: true,
                },
                {
                    label: "Pref Labs",
                    icon: <TestTube size={12} />,
                    page: "practice",
                    soon: true,
                },
                {
                    label: "Fav Investigations",
                    icon: <Star size={12} />,
                    page: "practice",
                    soon: true,
                },
                {
                    label: "Quick Presets",
                    icon: <Layers size={12} />,
                    page: "practice",
                    soon: true,
                },
            ],
        },
        { type: "divider" },
        {
            type: "page",
            label: "Clinic",
            icon: <Building2 size={14} />,
            page: "clinic",
            soon: true,
        },
        {
            type: "page",
            label: "Support",
            icon: <HelpCircle size={14} />,
            page: "support",
            soon: true,
        },
        {
            type: "page",
            label: "Settings",
            icon: <Settings size={14} />,
            page: "settings",
            soon: true,
        },
    ];

    return (
        <nav>
            {items.map((item, idx) => {
                if (item.type === "divider") {
                    return <div key={`div-${idx}`} className="sidebar-divider" />;
                }

                if (item.type === "section") {
                    return (
                        <div key={`sec-${idx}`} className="sidebar-section">
                            <span className="sidebar-section-label">{item.label}</span>
                        </div>
                    );
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

                if (item.type === "parent") {
                    const isOpenParent = practiceOpen;
                    return (
                        <div key={`par-${idx}`}>
                            <button
                                type="button"
                                className={`sidebar-nav-item is-parent${isOpenParent ? " is-open-parent" : ""}`}
                                onClick={() => setPracticeOpen((p) => !p)}
                            >
                                <span className="sidebar-nav-icon">{item.icon}</span>
                                {item.label}
                                <ChevronRight size={13} className="sidebar-parent-arrow" />
                            </button>
                            <div className={`sidebar-sub-items${isOpenParent ? " is-open" : ""}`}>
                                {item.children.map((child, ci) => (
                                    <button
                                        key={`child-${ci}`}
                                        type="button"
                                        className={`sidebar-nav-item is-sub${activePage === child.page ? " is-active" : ""}`}
                                        onClick={() => onNavigate(child.page)}
                                    >
                                        <span className="sidebar-nav-icon">{child.icon}</span>
                                        {child.label}
                                        {child.soon && (
                                            <span className="sidebar-soon-badge">Soon</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                }

                // type === "page"
                return (
                    <button
                        key={`page-${idx}`}
                        type="button"
                        className={`sidebar-nav-item${activePage === item.page ? " is-active" : ""}`}
                        onClick={() => onNavigate(item.page)}
                    >
                        <span className="sidebar-nav-icon">{item.icon}</span>
                        {item.label}
                        {item.soon && (
                            <span className="sidebar-soon-badge">Soon</span>
                        )}
                    </button>
                );
            })}
        </nav>
    );
}