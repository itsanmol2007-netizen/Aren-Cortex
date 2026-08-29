// ---------------------------------------------------------------------------
// BACK BUTTON — the one "return to my parent page" control in Cortex.
//
// Before this, the same job looked different on every page it appeared on:
// `PatientRecord` put it top-left, in a light bar under the dark
// `WorkspaceHeader`; the Prescription Editor put a differently-shaped pill
// top-right, INSIDE the dark header. Anmol: "keep every back button at one
// place, not randomly at this page here, that page there... this back button
// [PatientRecord's] is looking more better than top dark header."
//
// So: ONE shape, lifted verbatim from `PatientRecord.tsx`'s original
// `.prec-back-btn` (patients-detail.css) — light bordered pill, `ArrowLeft` +
// label, top-LEFT, in the page's own light body, never inside the dark
// header. Every page that is reached by drilling in from another one
// (Patient Record ← Patients, the Prescription Editor ← Clinic) renders this
// at the top of its own content, in the same position, so "how do I get
// back" is answered from the same place regardless of which page you drilled
// in from.
//
// Scope: the doctor-facing Cortex app (`src/features/*`, excluding
// `frontdesk/`). Front Desk is a separate, already-established suite with its
// own navigation language — folding it into this one component was not part
// of what was asked and risks a change nobody using that suite requested.
// ---------------------------------------------------------------------------

import { ArrowLeft } from "lucide-react";

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                "inline-flex cursor-pointer items-center gap-[6px] rounded-[8px] border " +
                "border-[#d0d8e8] bg-transparent px-[12px] py-[7px] text-[12px] font-semibold " +
                "text-[#475569] outline-none transition-colors hover:border-[#b8c8f0] " +
                "hover:bg-[#f4f7ff] hover:text-[#1268e8] " +
                "focus-visible:border-[#b8c8f0] focus-visible:bg-[#f4f7ff] focus-visible:text-[#1268e8]"
            }
        >
            <ArrowLeft size={13} />
            <span>{label}</span>
        </button>
    );
}
