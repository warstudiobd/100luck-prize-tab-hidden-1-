"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { STR, translate, type Lang, type MsgKey } from "@/lib/i18n";

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: MsgKey) => string }>({
  lang: "bn", setLang: () => {}, t: (k) => STR.bn[k],
});

export function LangProvider({ children, initial = "bn" }: { children: React.ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial);
  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("sonali7_lang") as Lang | null) : null;
    if (saved === "en" || saved === "bn") setLangState(saved);
    else if (typeof navigator !== "undefined" && !navigator.language.toLowerCase().startsWith("bn")) setLangState("en");
  }, []);
  useEffect(() => { try { document.documentElement.lang = lang; } catch {} }, [lang]);
  const setLang = useCallback((l: Lang) => { setLangState(l); try { document.documentElement.lang = l; localStorage.setItem("sonali7_lang", l); } catch {} }, []);
  const t = useCallback((k: MsgKey) => translate(lang, k), [lang]);
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}
export const useLang = () => useContext(LangCtx);
