import { useState } from "react";
import { X, FileText, AlignJustify, Printer, Check } from "lucide-react";
import type { PrintFormat } from "./usePrintFormat";

interface Props {
    current: PrintFormat;
    remembered: boolean;
    onConfirm: (format: PrintFormat, remember: boolean) => void;
    onClose: () => void;
}

const FORMATS: {
    id: PrintFormat;
    label: string;
    sub: string;
    size: string;
    icon: React.ElementType;
    preview: { w: number; h: number };
}[] = [
        {
            id: "a5",
            label: "Standard A5",
            sub: "Most common prescription pad size",
            size: "148 × 210 mm",
            icon: FileText,
            preview: { w: 42, h: 60 },
        },
        {
            id: "a4",
            label: "Full Page A4",
            sub: "Hospital / clinic letterhead format",
            size: "210 × 297 mm",
            icon: AlignJustify,
            preview: { w: 42, h: 59 },
        },
        {
            id: "thermal",
            label: "Thermal Printer",
            sub: "Narrow roll — black & white only",
            size: "80 mm wide",
            icon: Printer,
            preview: { w: 28, h: 60 },
        },
    ];

export default function PrintFormatSelector({
    current,
    remembered,
    onConfirm,
    onClose,
}: Props) {
    const [selected, setSelected] = useState<PrintFormat>(current);
    const [remember, setRemember] = useState<boolean>(remembered);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-[15px] font-bold text-gray-900 tracking-tight">
                            Choose Print Format
                        </h3>
                        <p className="text-[12px] text-gray-400 mt-0.5">
                            Select the format that matches your printer
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Format options */}
                <div className="px-6 py-4 space-y-3">
                    {FORMATS.map((f) => {
                        const Icon = f.icon;
                        const isSelected = selected === f.id;
                        return (
                            <button
                                key={f.id}
                                onClick={() => setSelected(f.id)}
                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${isSelected
                                        ? "border-blue-500 bg-blue-50/60"
                                        : "border-gray-100 bg-gray-50/40 hover:border-gray-200"
                                    }`}
                            >
                                {/* Paper preview thumbnail */}
                                <div className="shrink-0 flex items-end justify-center w-14 h-16">
                                    <div
                                        className={`rounded-sm border-2 transition-all ${isSelected ? "border-blue-400 bg-white shadow-md shadow-blue-100" : "border-gray-300 bg-white"
                                            }`}
                                        style={{ width: f.preview.w, height: f.preview.h }}
                                    >
                                        {/* Fake lines inside preview */}
                                        <div className="p-1 space-y-0.5 mt-1">
                                            {[...Array(f.id === "thermal" ? 6 : 4)].map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`h-0.5 rounded-full ${isSelected ? "bg-blue-200" : "bg-gray-200"}`}
                                                    style={{ width: `${70 + (i % 3) * 10}%` }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Label */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Icon className={`w-4 h-4 ${isSelected ? "text-blue-600" : "text-gray-400"}`} />
                                        <span className={`text-[14px] font-bold ${isSelected ? "text-blue-700" : "text-gray-800"}`}>
                                            {f.label}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5 ml-6">{f.sub}</p>
                                    <p className={`text-[10px] font-mono mt-1 ml-6 ${isSelected ? "text-blue-500" : "text-gray-400"}`}>
                                        {f.size}
                                    </p>
                                </div>

                                {/* Check */}
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "border-blue-500 bg-blue-500" : "border-gray-300"
                                    }`}>
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Remember choice */}
                <div className="px-6 pb-4">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div
                            onClick={() => setRemember(!remember)}
                            className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${remember ? "bg-blue-500" : "bg-gray-200"
                                }`}
                        >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${remember ? "translate-x-5" : "translate-x-0.5"
                                }`} />
                        </div>
                        <div>
                            <span className="text-[13px] font-medium text-gray-700">Remember my choice</span>
                            <p className="text-[11px] text-gray-400">Skip this screen next time</p>
                        </div>
                    </label>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(selected, remember)}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                        style={{ background: "linear-gradient(135deg, #1268e8, #7c3aed)" }}
                    >
                        Print Prescription
                    </button>
                </div>
            </div>
        </div>
    );
}