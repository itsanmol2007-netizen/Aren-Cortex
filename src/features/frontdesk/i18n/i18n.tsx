import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DICTS, en, type Lang, type StringKey } from "./strings";

// Translator: t(key, params?) → string. Empty values (unfilled `hi` stubs)
// fall back to English so the UI never shows a blank. «token» placeholders in
// the string are replaced by the matching key in `params`.
export type TFunc = (key: StringKey, params?: Record<string, string | number>) => string;

function translate(lang: Lang, key: StringKey, params?: Record<string, string | number>): string {
    const raw = DICTS[lang][key];
    let out = raw != null && raw !== "" ? raw : en[key] ?? String(key);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            out = out.split(`«${k}»`).join(String(v));
        }
    }
    return out;
}

type I18nValue = { lang: Lang; setLang: (l: Lang) => void; t: TFunc };

const I18nContext = createContext<I18nValue | null>(null);

const STORAGE_KEY = "aren.frontdesk.lang";

function loadLang(): Lang {
    if (typeof window === "undefined") return "en";
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "en" || saved === "hinglish" || saved === "hi" ? saved : "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Lang>(loadLang);

    const setLang = useCallback((l: Lang) => {
        setLangState(l);
        try {
            window.localStorage.setItem(STORAGE_KEY, l);
        } catch {
            /* localStorage unavailable — language just won't persist */
        }
    }, []);

    const value = useMemo<I18nValue>(
        () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
        [lang, setLang]
    );

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
    return ctx;
}

export function useT(): TFunc {
    return useI18n().t;
}
