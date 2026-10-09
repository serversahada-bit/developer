"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface TabDefinition {
  id: string;
  label: ReactNode;
  panel: ReactNode;
}

// Tabs whose selection follows the URL hash (#fpaa, #fpm), so back links can reopen a tab.
export default function Tabs({ tabs, label, variant = "underline" }: { tabs: TabDefinition[]; label: string; variant?: "underline" | "compact" }) {
  const [active, setActive] = useState(tabs[0]?.id);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (tabs.some((tab) => tab.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  function select(id: string) {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <>
      <div role="tablist" aria-label={label} className={variant === "underline" ? "flex border-b border-gray-200 px-6" : "mb-6 flex gap-2 border-b border-gray-200"}>
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-selected={active === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => select(tab.id)}
            className={`-mb-px border-b-2 px-4 py-3 text-sm transition-colors ${active === tab.id ? "border-indigo-600 font-semibold text-indigo-600" : "border-transparent font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={active !== tab.id}>
          {tab.panel}
        </div>
      ))}
    </>
  );
}
