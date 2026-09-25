// ---------------------------------------------------------------------------
// NEUROVASCULAR CHECK — distal to an injured limb, the four things an
// orthopaedic doctor checks before and after anything is done to it.
//
//   Distal pulse       Present | Weak | Absent
//   Capillary refill   Normal | Delayed
//   Motor              Intact | Reduced | Absent
//   Sensation          Intact | Altered | Absent
//
// Two or three options each, so each is one segmented control (the rule for
// short choices), never a row of chips; "All intact" records the common
// answer in one press. Saved per joint and side like range of motion
// (visit_measurements, `NV_<CHECK>_<REGION>`), so "tingling resolved" at the
// follow-up is a change in a reading, not a sentence someone has to find.
// ---------------------------------------------------------------------------

import { Check } from "lucide-react";
import type { ExaminationHook } from "../../hooks/useExamination";
import type { MeasureSide } from "../../lib/db/examination";
import { Segmented } from "./DetailInput";

export const NV_CHECKS = [
    { key: "NV_PULSE", label: "Distal pulse", options: ["Present", "Weak", "Absent"], normal: "Present" },
    { key: "NV_CRT", label: "Capillary refill", options: ["Normal", "Delayed"], normal: "Normal" },
    { key: "NV_MOTOR", label: "Motor", options: ["Intact", "Reduced", "Absent"], normal: "Intact" },
    { key: "NV_SENSATION", label: "Sensation", options: ["Intact", "Altered", "Absent"], normal: "Intact" },
] as const;

/** The limbs a neurovascular check applies to — not the spine, trunk or head. */
export const NV_REGIONS = new Set([
    "shoulder", "upper_arm", "elbow", "forearm", "wrist", "hand",
    "hip", "thigh", "knee", "lower_leg", "ankle", "foot",
]);

export const nvKey = (check: string, region: string) => `${check}_${region.toUpperCase()}`;

export function NeurovascularCheck({ exam, region, side, disabled = false }: {
    exam: ExaminationHook;
    region: string;
    side: MeasureSide | null;
    disabled?: boolean;
}) {
    const values = NV_CHECKS.map((c) => exam.getText(nvKey(c.key, region), side));
    const allIntact = values.every((v, i) => v === NV_CHECKS[i].normal);
    const anyAbnormal = values.some((v, i) => v && v !== NV_CHECKS[i].normal);

    return (
        <section className="cs-nv" aria-label="Neurovascular check">
            <div className="cs-nv-head">
                <span className="cs-nv-title">Neurovascular</span>
                {anyAbnormal && <span className="cs-nv-flag">Compromised</span>}
                <button
                    type="button"
                    className={`cs-nv-all${allIntact ? " is-on" : ""}`}
                    disabled={disabled}
                    aria-pressed={allIntact}
                    onClick={() => NV_CHECKS.forEach((c) => exam.setText(nvKey(c.key, region), side, c.normal))}
                >
                    {allIntact && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}
                    All intact
                </button>
            </div>
            <div className="cs-nv-rows">
                {NV_CHECKS.map((c, i) => (
                    <div key={c.key} className={`cs-nv-row${values[i] && values[i] !== c.normal ? " is-abnormal" : ""}`}>
                        <span className="cs-nv-label">{c.label}</span>
                        <Segmented
                            label={c.label}
                            disabled={disabled}
                            options={c.options.map((o) => ({ value: o }))}
                            value={values[i]}
                            onChange={(v) => exam.setText(nvKey(c.key, region), side, v ?? null)}
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}
