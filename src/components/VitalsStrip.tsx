import { Activity, Droplets, HeartPulse, Scale, Thermometer } from "lucide-react";
import type { Vitals } from "../types";

type VitalsStripProps = {
  vitals: Vitals;
  onVitalsChange: (vitals: Vitals) => void;
};

const vitalsConfig = [
  { key: "bp", label: "BP (mmHg)", icon: Activity, placeholder: "120/80" },
  { key: "pulse", label: "Pulse (bpm)", icon: HeartPulse, placeholder: "72" },
  { key: "temp", label: "Temp (F)", icon: Thermometer, placeholder: "98.6" },
  { key: "spo2", label: "SpO2 (%)", icon: Droplets, placeholder: "98" },
  { key: "weight", label: "Weight (kg)", icon: Scale, placeholder: "65" },
] as const;

export function VitalsStrip({ vitals, onVitalsChange }: VitalsStripProps) {
  return (
    <section className="vitals-strip" aria-label="Vitals">
      <div className="panel-title">
        <Activity size={18} />
        <h2>Vitals</h2>
      </div>
      <div className="vitals-grid">
        {vitalsConfig.map(({ key, label, icon: Icon, placeholder }) => (
          <label className="vital-item" key={key}>
            <Icon size={20} />
            <span>{label}</span>
            <input value={vitals[key]} placeholder={placeholder} onChange={(event) => onVitalsChange({ ...vitals, [key]: event.target.value })} />
          </label>
        ))}
      </div>
    </section>
  );
}
