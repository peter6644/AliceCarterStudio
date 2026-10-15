"use client";

import { useEffect } from "react";
import { Icon } from "./icons";

/** The original app's slide-over panel. */
export default function Panel({
  open,
  onClose,
  head,
  foot,
  children,
}: {
  open: boolean;
  onClose: () => void;
  head: React.ReactNode;
  foot?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  return (
    <>
      <div className={`scrim ${open ? "show" : ""}`} onClick={onClose} />
      <div className={`panel ${open ? "show" : ""}`} aria-hidden={!open}>
        {open && (
          <>
            <div className="phead">
              <div>{head}</div>
              <button className="xbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="pbody">{children}</div>
            {foot && <div className="pfoot">{foot}</div>}
          </>
        )}
      </div>
    </>
  );
}
