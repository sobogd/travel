"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { apiFetch } from "@/lib/client";

type Quota = {
  tokens: number;
  unitsLimit: number;
  unitsRemaining: number;
  resetAt: string | null;
};

function resetIn(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.round((Date.parse(iso) - Date.now()) / 86400000);
  if (days <= 0) return "скоро";
  if (days === 1) return "1 дн";
  return `${days} дн`;
}

// Refetches whenever `refreshKey` changes (parent bumps it after a search).
export function QuotaBadge({ refreshKey }: { refreshKey: number }) {
  const [q, setQ] = useState<Quota | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setQ(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (!q) return null;

  const pct = q.unitsLimit ? q.unitsRemaining / q.unitsLimit : 0;
  const color = pct > 0.3 ? "text-emerald-600" : pct > 0.1 ? "text-amber-500" : "text-red-500";
  const reset = resetIn(q.resetAt);

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
      title={`api-units: ${q.unitsRemaining}/${q.unitsLimit} · ${q.tokens} токен(ов)${reset ? ` · сброс ${reset}` : ""}`}
    >
      <Gauge size={13} className={color} />
      <span className={`font-mono font-semibold ${color}`}>{q.unitsRemaining}</span>
      <span style={{ color: "var(--hint)" }}>/ {q.unitsLimit}</span>
      {reset && <span style={{ color: "var(--hint)" }}>· {reset}</span>}
    </div>
  );
}
