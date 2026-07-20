// Clinic Status — the operational model behind the receptionist-facing page.
//
// This is the "Error Morphology" layer made concrete: technical service health
// is translated into operational meaning (headline / impact / recovery) BEFORE
// it ever reaches the receptionist. Nothing here shows a stack trace; every
// piece of copy answers "can I keep working, and if not, what do I press?".
//
// There is no live monitoring backend yet, so the default snapshot is the real
// state of a healthy clinic (everything operational). The `demo` switch
// (?demo=warning / ?demo=critical) drives the exact same morphology through a
// degraded state so the warning/critical presentation can be seen and reviewed
// — the page reads it, it is not hardcoded per-screen. When real probes land,
// only `buildServices()` changes; every view above it keeps working unchanged.

import {
    UserPlus,
    FolderOpen,
    Users,
    Printer,
    Stethoscope,
    Wifi,
    Cloud,
    MessageCircle,
    Database,
    type LucideIcon,
} from "lucide-react";
import type { StringKey } from "../i18n/strings";

export type ServiceState = "operational" | "attention" | "offline" | "notConfigured";
export type OverallState = "healthy" | "warning" | "critical";
export type ServiceGroup = "core" | "supporting";
export type DemoState = "healthy" | "warning" | "critical";

export type Service = {
    id: string;
    group: ServiceGroup;
    icon: LucideIcon;
    nameKey: StringKey;
    descKey: StringKey;
    state: ServiceState;
    // A one-line "why this matters" shown on the service's own detail page —
    // gives every service a distinct identity even when perfectly healthy.
    roleKey: StringKey;
    // The one line shown on the detailed row. `metricKey` carries a «v» slot
    // filled by `metricValue` (e.g. "Response «v»" + "120 ms").
    metricKey: StringKey;
    metricValue?: string;
    // Level-3 morphology — only meaningful once the service is degraded.
    impactKey: StringKey; // "what this affects", in plain language
    recoveryKeys: StringKey[]; // ordered recovery steps
    autoRecovery: boolean; // is AREN attempting to self-heal
    // Support-facing technical payload (Copy Diagnostics). Data, not UI copy.
    diagnostics: string;
    // When degraded, the situation copy this service contributes to the hero.
    situationHeadKey?: StringKey;
    situationBodyKey?: StringKey;
    situationActionKey?: StringKey;
};

export type Situation = {
    overall: OverallState;
    headlineKey: StringKey;
    bodyKey: StringKey;
    actionKey: StringKey | null;
};

export type ClinicStatus = {
    overall: OverallState;
    situation: Situation;
    services: Service[];
    core: Service[];
    supporting: Service[];
    coreTotal: number;
    coreOperational: number;
    servicesTotal: number;
    servicesOnline: number;
    onlinePct: number;
    attentionCount: number;
    issues: Service[]; // degraded services, worst first
};

// A service counts as "online" unless it is actively down or asking for help.
// A supporting service that was never set up (WhatsApp) is not a fault — it
// stays counted as online so the clinic never looks broken over an unused add-on.
function isOnline(s: ServiceState): boolean {
    return s === "operational" || s === "notConfigured";
}

const SEVERITY: Record<ServiceState, number> = {
    offline: 3,
    attention: 2,
    notConfigured: 0,
    operational: 0,
};

// Live operational signals the model reacts to. `online` is the real thing —
// navigator.onLine — so losing Wi-Fi actually changes the page. `demo` remains
// only for signals we have no real probe for yet (the printer).
export type Signals = { demo: DemoState; online: boolean };

// The service catalog, resolved to a state from live signals. Internet health
// is REAL (driven by connectivity); the printer is still demo-driven; a dropped
// connection also pauses Cloud Sync. Everything else stays operational.
function buildServices({ demo, online }: Signals): Service[] {
    const printerState: ServiceState =
        demo === "warning" ? "attention" : demo === "critical" ? "attention" : "operational";
    // Offline for real (navigator.onLine) OR simulated via ?demo=critical.
    const internetOffline = !online || demo === "critical";
    const internetState: ServiceState = internetOffline ? "offline" : "operational";
    const cloudState: ServiceState = internetOffline ? "attention" : "operational";

    return [
        {
            id: "registration",
            group: "core",
            icon: UserPlus,
            nameKey: "svcRegName",
            descKey: "svcRegDesc",
            state: "operational",
            roleKey: "roleReg",
            metricKey: "csMetricResponse",
            metricValue: "120 ms",
            impactKey: "csImpactNone",
            recoveryKeys: [],
            autoRecovery: false,
            diagnostics: "registration.write ok · p95 120ms",
        },
        {
            id: "records",
            group: "core",
            icon: FolderOpen,
            nameKey: "svcRecordsName",
            descKey: "svcRecordsDesc",
            state: "operational",
            roleKey: "roleRecords",
            metricKey: "csMetricResponse",
            metricValue: "98 ms",
            impactKey: "csImpactNone",
            recoveryKeys: [],
            autoRecovery: false,
            diagnostics: "records.read ok · p95 98ms",
        },
        {
            id: "queue",
            group: "core",
            icon: Users,
            nameKey: "svcQueueName",
            descKey: "svcQueueDesc",
            state: "operational",
            roleKey: "roleQueue",
            metricKey: "csMetricResponse",
            metricValue: "110 ms",
            impactKey: "csImpactNone",
            recoveryKeys: [],
            autoRecovery: false,
            diagnostics: "queue.poll ok · 25s interval",
        },
        {
            id: "printing",
            group: "core",
            icon: Printer,
            nameKey: "svcPrintName",
            descKey: "svcPrintDesc",
            state: printerState,
            roleKey: "rolePrint",
            metricKey: printerState === "operational" ? "csMetricResponse" : "csMetricOffline",
            metricValue: printerState === "operational" ? "115 ms" : undefined,
            impactKey: printerState === "operational" ? "csImpactNone" : "csPrintImpact",
            recoveryKeys: printerState === "operational" ? [] : ["csPrintStep1", "csPrintStep2", "csPrintStep3"],
            autoRecovery: printerState !== "operational",
            diagnostics:
                printerState === "operational"
                    ? "printer.spooler ok · usb connected"
                    : "printer.spooler err=USB_UNAVAILABLE · driver=idle · last_ok=11:04pm",
            situationHeadKey: "csWarnHead",
            situationBodyKey: "csWarnBody",
            situationActionKey: "csWarnAction",
        },
        {
            id: "doctor",
            group: "core",
            icon: Stethoscope,
            nameKey: "svcDoctorName",
            descKey: "svcDoctorDesc",
            state: "operational",
            roleKey: "roleDoctor",
            metricKey: "csMetricResponse",
            metricValue: "115 ms",
            impactKey: "csImpactNone",
            recoveryKeys: [],
            autoRecovery: false,
            diagnostics: "consult.channel ok · realtime connected",
        },
        {
            id: "internet",
            group: "supporting",
            icon: Wifi,
            nameKey: "svcInternetName",
            descKey: "svcInternetDesc",
            state: internetState,
            roleKey: "roleInternet",
            metricKey: internetOffline ? "csMetricNoConnection" : "csMetricUptime",
            metricValue: internetOffline ? undefined : "100%",
            impactKey: internetOffline ? "csInternetOfflineImpact" : "csImpactNone",
            recoveryKeys: internetOffline ? ["csOfflineStep1", "csOfflineStep2"] : [],
            autoRecovery: internetOffline,
            diagnostics: internetOffline ? "net.link DOWN · navigator.onLine=false · retrying" : "net.uptime 100% · rtt 24ms",
            situationHeadKey: "csOfflineHead",
            situationBodyKey: "csOfflineBody",
            situationActionKey: "csOfflineAction",
        },
        {
            id: "cloud",
            group: "supporting",
            icon: Cloud,
            nameKey: "svcCloudName",
            descKey: "svcCloudDesc",
            state: cloudState,
            roleKey: "roleCloud",
            metricKey: cloudState === "operational" ? "csMetricLastSync" : "csMetricSyncPaused",
            metricValue: cloudState === "operational" ? "just now" : undefined,
            impactKey: cloudState === "operational" ? "csImpactNone" : "csCloudPausedImpact",
            recoveryKeys: cloudState === "operational" ? [] : ["csOfflineStep2"],
            autoRecovery: cloudState !== "operational",
            diagnostics: cloudState === "operational" ? "sync.push ok · queue empty" : "sync.paused · offline · queue holding",
        },
        {
            id: "whatsapp",
            group: "supporting",
            icon: MessageCircle,
            nameKey: "svcWhatsAppName",
            descKey: "svcWhatsAppDesc",
            state: "notConfigured",
            roleKey: "roleWhatsApp",
            metricKey: "csStateNotConfigured",
            impactKey: "csImpactNone",
            recoveryKeys: [],
            autoRecovery: false,
            diagnostics: "whatsapp.provider not_configured",
        },
        {
            id: "backup",
            group: "supporting",
            icon: Database,
            nameKey: "svcBackupName",
            descKey: "svcBackupDesc",
            state: "operational",
            roleKey: "roleBackup",
            metricKey: "csMetricLastBackup",
            metricValue: "10:42 pm",
            impactKey: "csImpactNone",
            recoveryKeys: [],
            autoRecovery: false,
            diagnostics: "backup.snapshot ok · nightly",
        },
    ];
}

function deriveSituation(services: Service[]): Situation {
    // Worst-affected service (offline outranks attention) drives the hero.
    const degraded = services
        .filter((s) => SEVERITY[s.state] > 0)
        .sort((a, b) => SEVERITY[b.state] - SEVERITY[a.state]);

    if (degraded.length === 0) {
        return { overall: "healthy", headlineKey: "csHealthyHead", bodyKey: "csHealthyBody", actionKey: null };
    }

    const worst = degraded[0];
    const overall: OverallState = worst.state === "offline" ? "critical" : "warning";
    return {
        overall,
        headlineKey: worst.situationHeadKey ?? (overall === "critical" ? "csCritHead" : "csWarnHead"),
        bodyKey: worst.situationBodyKey ?? (overall === "critical" ? "csCritBody" : "csWarnBody"),
        actionKey: worst.situationActionKey ?? (overall === "critical" ? "csCritAction" : "csWarnAction"),
    };
}

// Pure snapshot builder — the single place service health becomes a page model.
export function buildClinicStatus(signals: Signals): ClinicStatus {
    const services = buildServices(signals);
    const core = services.filter((s) => s.group === "core");
    const supporting = services.filter((s) => s.group === "supporting");
    const situation = deriveSituation(services);

    const servicesOnline = services.filter((s) => isOnline(s.state)).length;
    const coreOperational = core.filter((s) => s.state === "operational").length;
    const issues = services
        .filter((s) => SEVERITY[s.state] > 0)
        .sort((a, b) => SEVERITY[b.state] - SEVERITY[a.state]);

    return {
        overall: situation.overall,
        situation,
        services,
        core,
        supporting,
        coreTotal: core.length,
        coreOperational,
        servicesTotal: services.length,
        servicesOnline,
        onlinePct: Math.round((servicesOnline / services.length) * 100),
        attentionCount: issues.length,
        issues,
    };
}

// Read the demo scenario from the URL once (?demo=warning | ?demo=critical).
// Absent / unknown ⇒ the true healthy state.
export function readDemoState(search: string): DemoState {
    const v = new URLSearchParams(search).get("demo");
    return v === "warning" || v === "critical" ? v : "healthy";
}
