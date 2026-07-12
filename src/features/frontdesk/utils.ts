// Pure presentational helpers shared across Front Desk components.
// No DB calls, no side effects — safe to import anywhere in this feature.

export function timeAgo(iso: string): string {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "Just now";
    if (mins === 1) return "1 min";
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export function formatShortDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function maskPhone(phone: string): string {
    if (!phone || phone.length < 4) return phone || "";
    return phone.slice(0, 4) + "X".repeat(Math.max(0, phone.length - 4));
}

export function initials(name: string): string {
    return name
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

export function padToken(token: number | null): string {
    if (token == null) return "—";
    return String(token).padStart(3, "0");
}
