// ---------------------------------------------------------------------------
// The PIN lock's actual screen. Deliberately says almost nothing: doctor
// name + clinic name, a 4-digit PIN pad, nothing else — no nav, no patient
// data, no toasts bleeding through from underneath. `AppLockGate` decides
// WHEN this renders; this component only knows how to take a PIN (or run
// the forgotten-PIN recovery) and never renders itself once unlocked.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { ArenMark } from "../features/auth/ArenMark";
import { supabase } from "../lib/supabase";
import { phoneToAuthEmail, phoneToStaffAuthEmail } from "../lib/auth";
import { unlockWithPin, recoverPinFromEscrow, hasEscrowBackup } from "../lib/security/deviceKey";
import { isWebAuthnUnlockAvailable, unlockWithWebAuthn } from "../lib/security/webauthn";

const MAX_ATTEMPTS_BEFORE_BACKOFF = 5;
const BACKOFF_MS = 15_000;

type Screen = "pin" | "forgot-password" | "forgot-newpin";

export function LockScreen({
    userId, doctorName, clinicName, phone, role,
}: {
    userId: string;
    doctorName: string;
    clinicName: string;
    phone: string;
    role: string;
}) {
    const [screen, setScreen] = useState<Screen>("pin");
    const [pin, setPin] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [shake, setShake] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [backoffUntil, setBackoffUntil] = useState<number | null>(null);
    const [checking, setChecking] = useState(false);
    const [webAuthnAvailable, setWebAuthnAvailable] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        isWebAuthnUnlockAvailable(userId).then(setWebAuthnAvailable).catch(() => setWebAuthnAvailable(false));
    }, [userId]);

    // Refocus once the input is actually re-enabled, not eagerly the
    // instant a wrong PIN is caught: `checking` (and therefore the input's
    // own `disabled`) is still true in the DOM at that exact moment —
    // `submitPin`'s `finally` schedules `setChecking(false)` but React
    // hasn't committed it yet — so an imperative `.focus()` called right
    // there was a no-op on a still-disabled element, silently swallowing
    // every keystroke typed right after a wrong attempt. Tying the focus
    // to a real render where `checking` is false is what actually works.
    useEffect(() => {
        if (!checking) inputRef.current?.focus();
    }, [checking]);

    const backoffActive = backoffUntil != null && Date.now() < backoffUntil;

    const submitPin = async (candidate: string) => {
        if (checking || backoffActive) return;
        setChecking(true);
        setError(null);
        try {
            const ok = await unlockWithPin(userId, candidate);
            if (ok) return; // AppLockGate's subscription unmounts this
            const next = attempts + 1;
            setAttempts(next);
            setPin("");
            setShake(true);
            setTimeout(() => setShake(false), 350);
            if (next >= MAX_ATTEMPTS_BEFORE_BACKOFF) {
                setBackoffUntil(Date.now() + BACKOFF_MS);
                setAttempts(0);
                setError(`Too many attempts. Try again in ${Math.round(BACKOFF_MS / 1000)}s.`);
            } else {
                setError("Wrong PIN.");
            }
        } finally {
            setChecking(false);
        }
    };

    const onPinChange = (raw: string) => {
        const digits = raw.replace(/\D/g, "").slice(0, 4);
        setPin(digits);
        if (digits.length === 4) void submitPin(digits);
    };

    const onWebAuthn = async () => {
        setError(null);
        setChecking(true);
        try {
            const ok = await unlockWithWebAuthn(userId);
            if (!ok) setError("Could not verify with this device.");
        } catch {
            setError("Could not verify with this device.");
        } finally {
            setChecking(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-[28px] px-[20px]"
            style={{
                background:
                    "radial-gradient(1200px 600px at 50% -10%, rgba(99,17,211,0.25), transparent 60%), #050916",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Device locked"
        >
            <div className="flex flex-col items-center gap-[14px]">
                <span className="grid h-[64px] w-[64px] place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
                    <ArenMark size={34} ink="#ffffff" accent="#a855f7" />
                </span>
                <div className="flex flex-col items-center gap-[2px]">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                        {clinicName}
                    </span>
                    <span className="text-[19px] font-extrabold tracking-[-0.01em] text-white">{doctorName}</span>
                </div>
            </div>

            {screen === "pin" && (
                <div className="flex flex-col items-center gap-[16px]">
                    <div className="flex items-center gap-[6px] text-[12px] font-semibold text-white/40">
                        <Lock size={13} /> Locked — enter your PIN to continue
                    </div>

                    <div className={"relative " + (shake ? "lock-shake" : "")}>
                        <div className="flex gap-[14px]">
                            {[0, 1, 2, 3].map((i) => (
                                <span
                                    key={i}
                                    className={
                                        "h-[16px] w-[16px] rounded-full border-2 transition-colors " +
                                        (i < pin.length
                                            ? "border-[#a855f7] bg-[#a855f7]"
                                            : "border-white/25 bg-transparent")
                                    }
                                />
                            ))}
                        </div>
                        <input
                            ref={inputRef}
                            type="password"
                            inputMode="numeric"
                            autoFocus
                            disabled={checking || backoffActive}
                            value={pin}
                            onChange={(e) => onPinChange(e.target.value)}
                            aria-label="4-digit PIN"
                            className="absolute inset-0 h-full w-full cursor-default opacity-0"
                        />
                    </div>

                    {error && <span className="text-[12.5px] font-semibold text-[#f87171]">{error}</span>}

                    {webAuthnAvailable && !backoffActive && (
                        <button
                            type="button"
                            onClick={onWebAuthn}
                            disabled={checking}
                            className="flex items-center gap-[7px] rounded-[10px] border border-white/15 bg-white/[0.04] px-[14px] py-[8px] text-[12.5px] font-bold text-white/80 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed"
                        >
                            <ShieldCheck size={14} /> Unlock with this device
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={async () => {
                            setError(null);
                            const backedUp = await hasEscrowBackup(userId).catch(() => false);
                            if (!backedUp) {
                                setError(
                                    "Recovery isn't set up on this device yet — set a PIN once online and it will be."
                                );
                                return;
                            }
                            setScreen("forgot-password");
                        }}
                        className="text-[12px] font-semibold text-white/35 underline decoration-white/20 underline-offset-2 hover:text-white/60"
                    >
                        Forgot PIN?
                    </button>
                </div>
            )}

            {screen === "forgot-password" && (
                <ForgotPasswordStep
                    phone={phone}
                    role={role}
                    onVerified={() => setScreen("forgot-newpin")}
                    onCancel={() => setScreen("pin")}
                />
            )}

            {screen === "forgot-newpin" && (
                <NewPinStep userId={userId} onDone={() => setScreen("pin")} onCancel={() => setScreen("pin")} />
            )}

            <style>{`
                @keyframes lockShake {
                    10%, 90% { transform: translateX(-2px); }
                    20%, 80% { transform: translateX(4px); }
                    30%, 50%, 70% { transform: translateX(-8px); }
                    40%, 60% { transform: translateX(8px); }
                }
                .lock-shake { animation: lockShake 0.35s ease-in-out; }
            `}</style>
        </div>
    );
}

/** Step 1 of recovery: prove it's really them with the one credential the
 *  PIN was never meant to replace. Never touches local data — a forgotten
 *  PIN recovers the SAME cache, it never wipes it (see deviceKey.ts). */
function ForgotPasswordStep({
    phone, role, onVerified, onCancel,
}: {
    phone: string;
    role: string;
    onVerified: () => void;
    onCancel: () => void;
}) {
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const verify = async () => {
        if (!password) { setError("Enter your password."); return; }
        setBusy(true);
        setError(null);
        try {
            const email = role === "reception" ? phoneToStaffAuthEmail(phone) : phoneToAuthEmail(phone);
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) {
                setError("That password doesn't match your account.");
                return;
            }
            onVerified();
        } catch {
            setError("Could not verify — check your connection and try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex w-[280px] flex-col items-center gap-[12px]">
            <p className="text-center text-[12.5px] leading-[1.5] text-white/55">
                Enter your account password to reset your PIN. Nothing stored on this device is affected.
            </p>
            <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void verify(); }}
                placeholder="Account password"
                className="h-[42px] w-full rounded-[10px] border border-white/15 bg-white/[0.05] px-[13px] text-[13.5px] font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#a855f7]"
            />
            {error && <span className="text-[12px] font-semibold text-[#f87171]">{error}</span>}
            <div className="flex w-full gap-[8px]">
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-[38px] flex-1 rounded-[10px] border border-white/15 bg-transparent text-[12.5px] font-bold text-white/60 hover:text-white/90"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={() => void verify()}
                    disabled={busy}
                    className="h-[38px] flex-1 rounded-[10px] border-0 bg-gradient-to-br from-[#f472b6] to-[#a855f7] text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy ? "Verifying…" : "Verify"}
                </button>
            </div>
        </div>
    );
}

/** Step 2: password just verified — pull the escrowed DEK and set a fresh
 *  PIN over it. See deviceKey.ts's `recoverPinFromEscrow`. */
function NewPinStep({ userId, onDone, onCancel }: { userId: string; onDone: () => void; onCancel: () => void }) {
    const [pin1, setPin1] = useState("");
    const [pin2, setPin2] = useState("");
    const [stage, setStage] = useState<"first" | "confirm">("first");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const digits = (raw: string) => raw.replace(/\D/g, "").slice(0, 4);

    const submit = async (confirmed: string) => {
        if (confirmed !== pin1) {
            setError("PINs didn't match — try again.");
            setPin1("");
            setPin2("");
            setStage("first");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await recoverPinFromEscrow(userId, pin1);
            onDone();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not recover your PIN right now.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex w-[280px] flex-col items-center gap-[12px]">
            <p className="text-center text-[12.5px] leading-[1.5] text-white/55">
                {stage === "first" ? "Choose a new 4-digit PIN." : "Enter it once more to confirm."}
            </p>
            <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={stage === "first" ? pin1 : pin2}
                onChange={(e) => {
                    const v = digits(e.target.value);
                    if (stage === "first") {
                        setPin1(v);
                        if (v.length === 4) setStage("confirm");
                    } else {
                        setPin2(v);
                        if (v.length === 4) void submit(v);
                    }
                }}
                placeholder="••••"
                className="h-[46px] w-[140px] rounded-[10px] border border-white/15 bg-white/[0.05] text-center text-[20px] tracking-[0.5em] font-bold text-white outline-none focus:border-[#a855f7]"
            />
            {error && <span className="text-[12px] font-semibold text-[#f87171]">{error}</span>}
            {busy && <span className="text-[12px] text-white/50">Recovering…</span>}
            <button
                type="button"
                onClick={onCancel}
                className="text-[12px] font-semibold text-white/35 underline decoration-white/20 underline-offset-2 hover:text-white/60"
            >
                Cancel
            </button>
        </div>
    );
}
