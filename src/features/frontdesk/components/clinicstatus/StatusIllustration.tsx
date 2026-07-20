import {
    FolderOpen,
    Users,
    Printer,
    Wifi,
    Cloud,
    Stethoscope,
    Check,
    Minus,
    AlertTriangle,
    type LucideIcon,
} from "lucide-react";
import type { OverallState } from "../../clinicStatus/model";

// ── AREN operational-integrity illustration ────────────────────────────────
//
// The reusable illustration language for Clinic Status: an integrity core (the
// clinic's operational heart) stitched by dawn-thread pathways to a
// constellation of service nodes, with light travelling along the connections
// like data in flight — synchronisation made visible. It is deliberately
// abstract: a connected service ecosystem and a shield, never a person or a
// device, and it carries emotional state, not readings:
//
//   healthy  → every pathway threaded and flowing, calm green core, soft aura
//   warning  → one pathway stalls to an amber dashed line, its node steps back
//   critical → one pathway fractures with a spark, its node muted red
//
// One SVG, no external assets, sizes to its container, stills completely under
// prefers-reduced-motion. The two motifs the brief asked for — a network and a
// shield — do the work; there is no concentric-circle wallpaper.

type Accent = {
    core: string;
    coreDeep: string;
    halo: string;
    ring: string;
    field: string;
    Glyph: LucideIcon;
};

const ACCENTS: Record<OverallState, Accent> = {
    healthy: { core: "#2bab66", coreDeep: "#1c8a4d", halo: "rgba(39,163,95,0.22)", ring: "#bfead1", field: "rgba(39,163,95,0.05)", Glyph: Check },
    warning: { core: "#d68f2f", coreDeep: "#bd7519", halo: "rgba(201,121,26,0.20)", ring: "#f4dcb6", field: "rgba(201,121,26,0.05)", Glyph: Minus },
    critical: { core: "#db4a41", coreDeep: "#c33b33", halo: "rgba(210,59,52,0.18)", ring: "#f3c8c4", field: "rgba(210,59,52,0.045)", Glyph: AlertTriangle },
};

type Node = { x: number; y: number; icon: LucideIcon; affected?: boolean };

// Core sits left-of-centre; nodes fan out into a loose constellation. The
// top-right node is the one that degrades — matching the printer example.
const CORE = { x: 176, y: 192 };
const NODES: Node[] = [
    { x: 98, y: 76, icon: FolderOpen },
    { x: 250, y: 58, icon: Users },
    { x: 404, y: 92, icon: Printer, affected: true },
    { x: 452, y: 216, icon: Wifi },
    { x: 356, y: 314, icon: Cloud },
    { x: 192, y: 322, icon: Stethoscope },
];

// A gently curved pathway from the core to a node: the control point is the
// midpoint nudged along the perpendicular so lines arc rather than spoke.
function ctrl(n: Node) {
    const mx = (CORE.x + n.x) / 2;
    const my = (CORE.y + n.y) / 2;
    const dx = n.x - CORE.x;
    const dy = n.y - CORE.y;
    return { cx: mx + dy * 0.1, cy: my - dx * 0.1 };
}
function pathTo(n: Node): string {
    const { cx, cy } = ctrl(n);
    return `M ${CORE.x} ${CORE.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${n.x} ${n.y}`;
}

// A fractured pathway (critical): stop short of the node, leave a gap, resume.
function fracturedTo(n: Node): { near: string; far: string; gap: { x: number; y: number } } {
    const at = (t: number) => ({ x: CORE.x + (n.x - CORE.x) * t, y: CORE.y + (n.y - CORE.y) * t });
    const b1 = at(0.6);
    const b2 = at(0.78);
    const { cx, cy } = ctrl(n);
    return {
        near: `M ${CORE.x} ${CORE.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b1.x.toFixed(1)} ${b1.y.toFixed(1)}`,
        far: `M ${b2.x.toFixed(1)} ${b2.y.toFixed(1)} L ${n.x} ${n.y}`,
        gap: at(0.69),
    };
}

export function StatusIllustration({ state, className = "" }: { state: OverallState; className?: string }) {
    const a = ACCENTS[state];
    const uid = `csi-${state}`;

    return (
        <svg
            viewBox="0 0 520 384"
            fill="none"
            role="img"
            aria-hidden="true"
            className={className}
            preserveAspectRatio="xMidYMid meet"
        >
            <style>{`
                @keyframes ${uid}-breathe { 0%,100% { opacity:.55; transform:scale(1) } 50% { opacity:.9; transform:scale(1.05) } }
                @keyframes ${uid}-flow { to { stroke-dashoffset: -220 } }
                @keyframes ${uid}-spark { 0%,100% { opacity:.35; transform:scale(1) } 50% { opacity:.9; transform:scale(1.35) } }
                @keyframes ${uid}-seek { 0%,100% { opacity:.2 } 50% { opacity:.55 } }
                .${uid}-halo  { transform-box: fill-box; transform-origin: center; animation: ${uid}-breathe 5.5s ease-in-out infinite; }
                .${uid}-flow  { animation: ${uid}-flow 9s linear infinite; }
                .${uid}-spark { transform-box: fill-box; transform-origin: center; animation: ${uid}-spark 1.7s ease-in-out infinite; }
                .${uid}-seek  { transform-box: fill-box; transform-origin: center; animation: ${uid}-seek 2.2s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) {
                    .${uid}-halo, .${uid}-flow, .${uid}-spark, .${uid}-seek { animation: none; }
                }
            `}</style>

            <defs>
                <linearGradient id={`${uid}-thread`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#f2a986" />
                    <stop offset="0.34" stopColor="#f472b6" />
                    <stop offset="0.68" stopColor="#a855f7" />
                    <stop offset="1" stopColor="#6366f1" />
                </linearGradient>
                <linearGradient id={`${uid}-core`} x1="0" y1="0" x2="0.4" y2="1">
                    <stop offset="0" stopColor={a.core} />
                    <stop offset="1" stopColor={a.coreDeep} />
                </linearGradient>
                <radialGradient id={`${uid}-aura`} cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor={a.halo} />
                    <stop offset="1" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <radialGradient id={`${uid}-field`} cx="0.34" cy="0.5" r="0.62">
                    <stop offset="0" stopColor={a.field} />
                    <stop offset="1" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <radialGradient id={`${uid}-sheen`} cx="0.32" cy="0.24" r="0.75">
                    <stop offset="0" stopColor="rgba(255,255,255,0.42)" />
                    <stop offset="0.55" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <filter id={`${uid}-soft`} x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#2a2350" floodOpacity="0.10" />
                </filter>
            </defs>

            {/* Depth field — a soft, asymmetric operational glow, not a grid. */}
            <ellipse cx="250" cy="196" rx="250" ry="180" fill={`url(#${uid}-field)`} />

            {/* Faint constellation dust — a few stray signals in the space. */}
            <g fill="#c9c6e4" opacity="0.5">
                <circle cx="70" cy="204" r="2" />
                <circle cx="300" cy="150" r="1.6" />
                <circle cx="486" cy="122" r="2.2" />
                <circle cx="120" cy="300" r="1.6" />
                <circle cx="472" cy="300" r="1.8" />
                <circle cx="330" cy="40" r="1.6" />
            </g>

            {/* Pathways: a soft base thread + travelling light (flow). */}
            {NODES.map((n, i) => {
                const degraded = n.affected && state !== "healthy";

                if (degraded && state === "critical") {
                    const f = fracturedTo(n);
                    return (
                        <g key={i}>
                            <path d={f.near} stroke={`url(#${uid}-thread)`} strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
                            <path d={f.far} stroke={a.core} strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" opacity="0.7" />
                            <g className={`${uid}-spark`}>
                                <circle cx={f.gap.x} cy={f.gap.y} r="3.6" fill={a.core} />
                                <circle cx={f.gap.x} cy={f.gap.y} r="7" fill="none" stroke={a.core} strokeWidth="1" opacity="0.4" />
                            </g>
                        </g>
                    );
                }
                if (degraded) {
                    // warning — the thread stalls to an amber dashed line; a
                    // faint pulse at the node reads as "trying to reconnect".
                    return (
                        <path
                            key={i}
                            d={pathTo(n)}
                            stroke={a.core}
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeDasharray="2 7"
                            opacity="0.62"
                        />
                    );
                }
                return (
                    <g key={i}>
                        <path
                            d={pathTo(n)}
                            stroke={`url(#${uid}-thread)`}
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            opacity={state === "healthy" ? 0.42 : 0.34}
                        />
                        {/* travelling light — data in flight along the connection */}
                        <path
                            d={pathTo(n)}
                            className={`${uid}-flow`}
                            stroke={`url(#${uid}-thread)`}
                            strokeWidth="2.9"
                            strokeLinecap="round"
                            strokeDasharray="1 22"
                            style={{ animationDelay: `${i * 0.9}s` }}
                        />
                    </g>
                );
            })}

            {/* Service nodes. */}
            {NODES.map((n, i) => {
                const Icon = n.icon;
                const degraded = n.affected && state !== "healthy";
                const nodeStroke = degraded ? a.ring : "#eae7f6";
                const glyph = degraded ? a.core : "#8b84c0";
                return (
                    <g key={i} opacity={degraded ? 0.97 : 1}>
                        <circle cx={n.x} cy={n.y} r="26" fill="#ffffff" stroke={nodeStroke} strokeWidth={degraded ? 2 : 1.4} filter={`url(#${uid}-soft)`} />
                        <circle cx={n.x} cy={n.y} r="26" fill={`url(#${uid}-sheen)`} opacity="0.7" />
                        {degraded && (
                            <circle cx={n.x} cy={n.y} r="31" fill="none" stroke={a.core} strokeWidth="1.2" opacity="0.3" className={state === "warning" ? `${uid}-seek` : undefined} />
                        )}
                        <Icon x={n.x - 11} y={n.y - 11} width={22} height={22} stroke={glyph} strokeWidth={1.9} />
                        {/* state dot */}
                        <circle cx={n.x + 18} cy={n.y - 18} r="4.6" fill={degraded ? a.core : "#27a35f"} stroke="#ffffff" strokeWidth="1.7" />
                    </g>
                );
            })}

            {/* The integrity core — aura, shield silhouette, gradient tile with a
                glassy sheen, and the state glyph. */}
            <circle cx={CORE.x} cy={CORE.y} r="74" fill={`url(#${uid}-aura)`} className={`${uid}-halo`} />
            <path d={shieldPath(CORE.x, CORE.y, 60)} fill="none" stroke={a.ring} strokeWidth="1.5" opacity="0.75" />
            <rect x={CORE.x - 35} y={CORE.y - 35} width="70" height="70" rx="23" fill={`url(#${uid}-core)`} filter={`url(#${uid}-soft)`} />
            <rect x={CORE.x - 35} y={CORE.y - 35} width="70" height="70" rx="23" fill={`url(#${uid}-sheen)`} opacity="0.9" />
            <rect x={CORE.x - 35} y={CORE.y - 35} width="70" height="70" rx="23" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1" />
            <a.Glyph x={CORE.x - 16} y={CORE.y - 16} width={32} height={32} stroke="#ffffff" strokeWidth={2.6} />
        </svg>
    );
}

// A rounded shield silhouette centred on (cx,cy), height ≈ 2*r. Drawn faintly
// behind the core tile as the "operational integrity" motif.
function shieldPath(cx: number, cy: number, r: number): string {
    const top = cy - r;
    const w = r * 0.86;
    const shoulder = cy - r * 0.35;
    const waist = cy + r * 0.2;
    const tip = cy + r;
    return [
        `M ${cx} ${top}`,
        `C ${cx + w * 0.7} ${top + r * 0.12}, ${cx + w} ${shoulder - r * 0.1}, ${cx + w} ${shoulder}`,
        `C ${cx + w} ${waist + r * 0.15}, ${cx + w * 0.55} ${tip - r * 0.25}, ${cx} ${tip}`,
        `C ${cx - w * 0.55} ${tip - r * 0.25}, ${cx - w} ${waist + r * 0.15}, ${cx - w} ${shoulder}`,
        `C ${cx - w} ${shoulder - r * 0.1}, ${cx - w * 0.7} ${top + r * 0.12}, ${cx} ${top}`,
        "Z",
    ].join(" ");
}
