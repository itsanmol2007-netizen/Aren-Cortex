import { X, AlertTriangle, Stethoscope, Clock, Trash2, FileText, ArrowRight, Activity, Pill } from "lucide-react";
import { useState } from "react";
import { updateVisitStatus } from "@/lib/db";

type Props = {
    visitId: string;
    patientName: string;
    patientAge?: number;
    selectedSymptomsCount?: number;
    medicinesCount?: number;
    startedAt?: Date;
    onDiscard: () => void;
    onComplete: () => void;
    onClose: () => void;
};

export function ActiveConsultGuard({
    visitId,
    patientName,
    patientAge,
    selectedSymptomsCount = 0,
    medicinesCount = 0,
    startedAt,
    onDiscard,
    onComplete,
    onClose
}: Props) {
    const [loading, setLoading] = useState<string | null>(null);

    const getTimeElapsed = () => {
        if (!startedAt) return null;
        const minutes = Math.floor((new Date().getTime() - new Date(startedAt).getTime()) / 60000);
        if (minutes < 1) return "just now";
        if (minutes === 1) return "1 minute ago";
        return `${minutes} minutes ago`;
    };

    const handleRefer = async () => {
        setLoading('refer');
        try {
            await updateVisitStatus(visitId, 'referred');
            onComplete();
        } catch (error) {
            console.error('Failed to save as referral:', error);
        } finally {
            setLoading(null);
        }
    };

    const handleSaveDraft = async () => {
        setLoading('draft');
        try {
            await updateVisitStatus(visitId, 'draft');
            onComplete();
        } catch (error) {
            console.error('Failed to save draft:', error);
        } finally {
            setLoading(null);
        }
    };

    const handleDiscard = async () => {
        setLoading('discard');
        try {
            await updateVisitStatus(visitId, 'discarded');
            onDiscard();
        } catch (error) {
            console.error('Failed to discard:', error);
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-[460px] animate-in fade-in zoom-in-95 duration-200">

                {/* Modal Card */}
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

                    {/* Signature AREN Gradient Strip - More Visible */}
                    <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-sm" />

                    <div className="p-5">

                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex gap-3">
                                {/* Accent icon with gradient border */}
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-4 h-4 text-purple-500" strokeWidth={1.5} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold tracking-wider text-purple-500 uppercase mb-1">
                                        Action Required
                                    </p>
                                    <h2 className="text-lg font-semibold text-slate-900">
                                        Active consult in progress
                                    </h2>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                disabled={!!loading}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-all"
                            >
                                <X size={16} strokeWidth={1.5} />
                            </button>
                        </div>

                        {/* Helper Text */}
                        <p className="text-[13px] text-slate-500 leading-relaxed mb-4">
                            You have an active consult for{" "}
                            <span className="font-medium text-slate-700">{patientName}</span>
                            {patientAge && <span className="text-slate-400">, {patientAge} yrs</span>}.
                        </p>

                        {/* Consult Context */}
                        {(selectedSymptomsCount > 0 || medicinesCount > 0 || getTimeElapsed()) && (
                            <div className="bg-slate-50 rounded-xl p-3 mb-5 border border-slate-100">
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                    {selectedSymptomsCount > 0 && (
                                        <div className="flex items-center gap-1.5">
                                            <Activity className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                                            <span>{selectedSymptomsCount} symptom{selectedSymptomsCount !== 1 ? 's' : ''}</span>
                                        </div>
                                    )}
                                    {medicinesCount > 0 && (
                                        <div className="flex items-center gap-1.5">
                                            <Pill className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                                            <span>{medicinesCount} medicine{medicinesCount !== 1 ? 's' : ''}</span>
                                        </div>
                                    )}
                                    {getTimeElapsed() && (
                                        <div className="flex items-center gap-1.5 ml-auto">
                                            <Clock className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                                            <span>Started {getTimeElapsed()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Action Options */}
                        <div className="space-y-2">

                            {/* Save as Referral - Purple tinted */}
                            <button
                                onClick={handleRefer}
                                disabled={!!loading}
                                className="w-full text-left rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50/50 to-purple-50/30 hover:from-purple-100 hover:to-purple-50 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                <div className="flex items-center gap-3 px-3.5 py-3">
                                    <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                                        <Stethoscope className="w-3.5 h-3.5 text-purple-600" strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[13px] font-medium text-purple-900">Save as referral</p>
                                        <p className="text-[11px] text-purple-500 mt-0.5">Mark for specialist review</p>
                                    </div>
                                    {loading === 'refer' ? (
                                        <div className="w-3.5 h-3.5 border border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                                    ) : (
                                        <ArrowRight className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all" strokeWidth={1.5} />
                                    )}
                                </div>
                            </button>

                            {/* Save as Draft - Neutral gray */}
                            <button
                                onClick={handleSaveDraft}
                                disabled={!!loading}
                                className="w-full text-left rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                <div className="flex items-center gap-3 px-3.5 py-3">
                                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                                        <Clock className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[13px] font-medium text-slate-700">Save as draft</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">Finish later from drafts</p>
                                    </div>
                                    {loading === 'draft' ? (
                                        <div className="w-3.5 h-3.5 border border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                                    ) : (
                                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" strokeWidth={1.5} />
                                    )}
                                </div>
                            </button>

                            {/* Discard - Red tinted */}
                            <button
                                onClick={handleDiscard}
                                disabled={!!loading}
                                className="w-full text-left rounded-xl border border-red-200 bg-white hover:bg-red-50 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                <div className="flex items-center gap-3 px-3.5 py-3">
                                    <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[13px] font-medium text-red-900">Discard consult</p>
                                        <p className="text-[11px] text-red-400 mt-0.5">Unsaved progress will be lost</p>
                                    </div>
                                    {loading === 'discard' && (
                                        <div className="w-3.5 h-3.5 border border-red-300 border-t-red-600 rounded-full animate-spin" />
                                    )}
                                </div>
                            </button>

                            {/* Continue Current Consult - Blue primary action */}
                            <button
                                onClick={onClose}
                                disabled={!!loading}
                                className="w-full text-left rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/50 to-blue-50/30 hover:from-blue-100 hover:to-blue-50 transition-all duration-150 mt-3 group"
                            >
                                <div className="flex items-center gap-3 px-3.5 py-3">
                                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                        <FileText className="w-3.5 h-3.5 text-blue-600" strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[13px] font-medium text-blue-900">Continue current consult</p>
                                        <p className="text-[11px] text-blue-500 mt-0.5">Return to active consult</p>
                                    </div>
                                    <ArrowRight className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" strokeWidth={1.5} />
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}