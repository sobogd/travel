"use client";

import { useEffect, useRef, useState } from "react";
import { Plane, X } from "lucide-react";
import { apiFetch } from "@/lib/client";
import type { Airport } from "@/lib/types";

export function AirportPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Airport | null;
  onChange: (a: Airport | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Airport[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  // debounce autocomplete lookups
  useEffect(() => {
    if (value) return; // a selection is shown, don't search
    const term = q.trim();
    if (term.length < 2) {
      setOpts([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/airports?q=${encodeURIComponent(term)}`);
        if (res.ok) {
          setOpts(await res.json());
          setOpen(true);
        }
      } catch {
        /* ignore */
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, value]);

  // close dropdown on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(a: Airport) {
    onChange(a);
    setOpen(false);
    setQ("");
  }

  function clear() {
    onChange(null);
    setQ("");
    setOpts([]);
  }

  return (
    <div className="relative" ref={boxRef}>
      <label className="mb-1 block text-xs font-medium" style={{ color: "var(--hint)" }}>
        {label}
      </label>

      {value ? (
        <div
          className="flex items-center gap-2 rounded-xl border px-3 py-3"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        >
          <Plane size={16} className="shrink-0 text-emerald-500" />
          <span className="min-w-0 flex-1 truncate text-base font-medium">
            <span className="font-mono">{value.code}</span>
            <span className="ml-2" style={{ color: "var(--hint)" }}>
              {value.city || value.name}
            </span>
          </span>
          <button
            onClick={clear}
            aria-label="Очистить"
            className="rounded-lg p-1 transition active:scale-90"
            style={{ color: "var(--hint)" }}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => opts.length && setOpen(true)}
          placeholder="Город или код (напр. OVD)"
          className="w-full rounded-xl border px-3 py-3 text-base outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          style={{ background: "var(--bg)", borderColor: "var(--border)" }}
        />
      )}

      {open && !value && opts.length > 0 && (
        <div
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border shadow-lg"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          {opts.map((a) => (
            <button
              key={a.code}
              onClick={() => pick(a)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-emerald-500/10"
            >
              <span className="w-10 shrink-0 font-mono text-sm font-semibold text-emerald-600">
                {a.code}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{a.city || a.name}</span>
                <span className="block truncate text-xs" style={{ color: "var(--hint)" }}>
                  {a.name} · {a.country}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
