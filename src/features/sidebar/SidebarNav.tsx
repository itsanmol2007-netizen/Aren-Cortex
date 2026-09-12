import {
    LayoutDashboard,
    Users,
    MessageSquare,
    Stethoscope,
    ClipboardList,
    Building2,
    LifeBuoy,
    Settings,
    type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// THE NAVIGATION REGISTRY — one list, read by both surfaces.
//
// Rebuilt 2026-08-23 (six destinations, not fifteen). Rebuilt again
// 2026-09-11, when navigation became a permanent rail: the list itself is
// unchanged, but it is no longer a component that renders a drawer. It is
// DATA now, and `NavRail` (collapsed, icons) and `Sidebar` (expanded,
// labels) both render from it — rule 19, when two things must agree, make
// one read the other. Adding a destination is one row here plus its page in
// App.tsx; neither surface needs touching, and they cannot drift apart.
//
// Anmol's original brief, still the rule: "don't create a page merely
// because a feature exists — create a page only when the user has a distinct
// recurring job to perform there." The old nav (Patients, Prescriptions,
// Investigations, Communication, Practice with 4 sub-items, Clinic, Support,
// Settings) had pages for FEATURES, not jobs. "Prescriptions" wasn't a
// distinct job — a doctor doesn't go BROWSE prescriptions as a task; they
// write one during a consult and, occasionally, look one up for a specific
// patient, which is already the Patient Detail page's job. Same reasoning
// killed "Investigations" and the Practice submenu (Commonly Used Meds /
// Preferred Labs / Favourite Investigations / Quick Presets — these are what
// Practice IS, not four separate destinations to reach it through).
//
// The six real jobs:
//   Consult        — do clinical work on the current patient (action, not a page)
//   Overview       — the doctor's own numbers, the landing page
//   Patients       — find, recognize, navigate to a patient
//   Communication  — the messaging workflow around clinical care
//   Practice       — configure how this doctor practices (meds/labs/templates)
//   Clinic         — configure the clinic itself (staff/hours/operations)
//   Settings       — account/system configuration
// Help & Support sits apart as a small utility — it isn't a job, it's an
// escape hatch.
// ---------------------------------------------------------------------------

export type SidebarPage =
    /**
     * The doctor's own landing page (2026-09-06). First in this union
     * because it is the app's initial `activePage` — a doctor now arrives at
     * their own numbers with one big door into the consult, instead of
     * straight onto the consult workspace.
     *
     * It is a real FEATURE PAGE and not a null activePage, deliberately:
     * App.tsx's standing "never a blank workspace" invariant only fires when
     * `activePage === null`, so treating Overview as a page is what keeps
     * that invariant intact rather than fighting it. See
     * features/overview/DoctorOverviewPage.tsx's own header.
     */
    | "overview"
    | "patients"
    | "communication"
    | "practice"
    | "clinic"
    | "settings"
    | "support";

/**
 * Which colour family an icon carries.
 *
 * Three tones, all cool-family, replacing the original five
 * (blue/teal/purple/amber/slate) on 2026-08-24 — Anmol: "the color they are
 * carrying is bad, like a mixture of color... make them belong from the same
 * color family." Teal and amber were the outliers (green- and orange-hued,
 * the actual "rainbow" the complaint was about).
 *
 * The grouping reads on its own even without the labels: **blue** for the
 * three patient-facing destinations, **indigo** for the two configuration
 * destinations, **slate** for the one account-level one.
 */
export type NavTone = "blue" | "indigo" | "slate";

export type NavDestination = {
    page: SidebarPage;
    label: string;
    icon: LucideIcon;
    tone: NavTone;
    /** Dividers are drawn between groups; the group number IS the grouping. */
    group: 1 | 2 | 3 | 4;
    /** Small, muted treatment, pinned to the bottom — Help & Support only. */
    utility?: boolean;
};

export const NAV_DESTINATIONS: NavDestination[] = [
    { page: "overview", label: "Overview", icon: LayoutDashboard, tone: "blue", group: 1 },
    { page: "patients", label: "Patients", icon: Users, tone: "blue", group: 1 },
    { page: "communication", label: "Communication", icon: MessageSquare, tone: "blue", group: 1 },
    // ClipboardList, not BriefcaseMedical — that read as near-identical to
    // Clinic's Building2 at rail size (both a blocky rectangle with a bar
    // across the top). "the icon of Clinic and Practice is more or less
    // same" (Anmol, 2026-09-12). A checklist silhouette (meds/labs/presets
    // ARE a set of standing preferences) reads distinctly from a building at
    // a glance, which is the one thing an always-on-screen rail icon has to do.
    { page: "practice", label: "Practice", icon: ClipboardList, tone: "indigo", group: 2 },
    { page: "clinic", label: "Clinic", icon: Building2, tone: "indigo", group: 2 },
    { page: "settings", label: "Settings", icon: Settings, tone: "slate", group: 3 },
    { page: "support", label: "Help & Support", icon: LifeBuoy, tone: "slate", group: 4, utility: true },
];

/**
 * The consult is an ACTION, not a destination — it does not set `activePage`,
 * it starts (or resumes) clinical work. It gets the brand's own violet and
 * the only filled treatment in the rail, because it is the one thing a
 * doctor opens this app to do.
 */
export const CONSULT_ACTION = { label: "Consult", icon: Stethoscope } as const;

/**
 * True when a hairline belongs above `d`.
 *
 * The grouping IS the divider rule — there is no second list of "where the
 * lines go" to keep in sync with this one, and the rail and the panel both
 * ask this same function so their hairlines can never fall in different
 * places (which would break the alignment contract the moment the panel
 * opened).
 */
export function startsGroup(d: NavDestination, prev: NavDestination | undefined): boolean {
    return prev !== undefined && prev.group !== d.group;
}
