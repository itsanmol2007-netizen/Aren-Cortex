// ── The constellation ──────────────────────────────────────────────────────
//
// The rail is light, so the atmosphere that carries the brand on the dark
// headers (a nebula bloom) would be invisible here — a wash that pale is just
// a dirty white. A constellation survives the translation: it is LINE work,
// so it reads at 8% ink on white the way a bloom only reads on navy.
//
// It is also already ours. The consult topbar has drawn one for months (see
// `.topbar-atmo`'s own <circle>/<line> cluster in PatientHeader.tsx), and the
// multi-doctor plan is named AREN Constellation. This is that motif at the
// app's left edge, not a decoration invented for one panel.
//
// ── Where it sits, and why that is the whole point ────────────────────────
// In the QUIET ZONE: the stretch of empty rail between the last nav item and
// the doctor's avatar. It was drawn across the full height first, which put
// stars and connecting lines directly behind the icons — at rail width they
// read as specks of dirt on the screen, not as a sky.
//
// Putting it here does two jobs with one mark. This app has a standing
// complaint about leftover height in a nav (see `.sidebar-divider.is-tail`'s
// note in sidebar.css, three attempts deep): dark empty space between groups
// "reads as something failing to load." The quiet zone is that same leftover
// height — and a constellation is exactly what belongs in it. The rail now
// ENDS deliberately instead of running out.
export function ConstellationWash() {
    return (
        <svg
            className="rail-constellation"
            viewBox="0 0 60 150"
            preserveAspectRatio="xMinYMid meet"
            aria-hidden="true"
        >
            <g stroke="#7c5cf0" strokeOpacity="0.15" strokeWidth="0.7" fill="none">
                <line x1="18" y1="22" x2="41" y2="44" />
                <line x1="41" y1="44" x2="24" y2="78" />
                <line x1="24" y1="78" x2="18" y2="22" />
                <line x1="41" y1="44" x2="46" y2="104" />
                <line x1="24" y1="78" x2="46" y2="104" />
                <line x1="24" y1="78" x2="14" y2="126" />
            </g>
            <g fill="#7c5cf0" fillOpacity="0.40">
                <circle cx="18" cy="22" r="1.5" />
                <circle cx="41" cy="44" r="2" />
                <circle cx="24" cy="78" r="1.7" />
                <circle cx="46" cy="104" r="1.3" />
                <circle cx="14" cy="126" r="1.6" />
            </g>
        </svg>
    );
}
