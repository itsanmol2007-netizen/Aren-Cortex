import { useState } from "react";
import { Lock, LogIn, Phone } from "lucide-react";
import logo from "../assets/aren-logo.png";
import { signInWithPhone } from "../lib/auth";

export function LoginPage() {
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const isValid = phone.length === 10 && password.length > 0;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!isValid || loading) return;
        setLoading(true);
        setError("");
        try {
            await signInWithPhone(phone, password);
            // onAuthStateChange (useAuth) picks up the new session from here.
        } catch (err: any) {
            setError(err.message === "Invalid login credentials"
                ? "Incorrect phone number or password."
                : err.message ?? "Sign-in failed.");
            setLoading(false);
        }
    }

    return (
        <div className="login-shell">
            <form className="pm-card login-card" onSubmit={handleSubmit}>
                <div className="pm-top-stripe" />

                <div className="login-brand">
                    <img src={logo} alt="AREN" className="login-logo" />
                    <div>
                        <strong className="login-brand-name">AREN <span>Cortex</span></strong>
                        <p className="login-brand-sub">Sign in to your consult workspace</p>
                    </div>
                </div>

                <div className="pm-section" style={{ paddingTop: 4 }}>
                    <div className="pm-field">
                        <label className="pm-label">
                            <Phone size={12} className="pm-label-icon" />
                            Phone number
                        </label>
                        <div className="pm-phone-row">
                            <span className="pm-phone-prefix">+91</span>
                            <input
                                autoFocus
                                className="pm-input pm-phone-input"
                                inputMode="tel"
                                maxLength={10}
                                value={phone}
                                placeholder="10-digit mobile"
                                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                            />
                        </div>
                    </div>

                    <div className="pm-field">
                        <label className="pm-label">
                            <Lock size={12} className="pm-label-icon" />
                            Password
                        </label>
                        <input
                            className="pm-input"
                            type="password"
                            value={password}
                            placeholder="••••••••"
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && <p className="pm-no-results" style={{ color: "#f87171" }}>{error}</p>}

                    <div className="pm-actions" style={{ justifyContent: "stretch" }}>
                        <button type="submit" className="pm-btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={!isValid || loading}>
                            <LogIn size={14} style={{ marginRight: 6 }} />
                            {loading ? "Signing in…" : "Sign in"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
