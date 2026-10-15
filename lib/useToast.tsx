"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const Ctx = createContext<(msg: string, warn?: boolean) => void>(() => {});

/** The original app's little bottom toast. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; warn: boolean } | null>(null);
  const [show, setShow] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((text: string, warn = false) => {
    setMsg({ text, warn });
    setShow(true);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setShow(false), warn ? 4000 : 2000);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className={`toast ${show ? "show" : ""}`} role="status">
        {msg && (
          <>
            <span className="dot" style={msg.warn ? { color: "#e0a3a0" } : undefined}>●</span>
            {msg.text}
          </>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
