"use client";

import { X, ArrowRight, Car, ExternalLink } from "lucide-react";
import { carrierName } from "@/lib/types";
import type { Leg, SearchResp } from "@/components/ResultsSheet";

const clock = (s: string | null) => {
  const m = s?.match(/[ T](\d{2}:\d{2})/);
  return m ? m[1] : "";
};
const legDate = (leg: Leg) => {
  const m = (leg.depLocal || "").match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
};

// Google Flights for every flight — one-way, exact date. (Airline-specific
// deeplinks dropped per request; Google is cleaner and universal.)
function deeplink(leg: Leg): string {
  const o = leg.fromIata, d = leg.toIata, dd = legDate(leg); // dd = YYYY-MM-DD
  const q = `One way flights from ${o} to ${d} on ${dd}`;
  return `https://www.google.com/travel/flights?hl=ru&curr=EUR&q=${encodeURIComponent(q)}`;
}

// unique key per physical flight (number + date)
const fid = (l: Leg) => `${l.flightNo || ""}|${legDate(l)}`;
function uniqueLegs(legs: Leg[]): Leg[] {
  const seen = new Map<string, Leg>();
  for (const l of legs) if (!seen.has(fid(l))) seen.set(fid(l), l);
  return [...seen.values()].sort((a, b) => clock(a.depLocal).localeCompare(clock(b.depLocal)));
}

type Group = { key: string; label: string; ground?: { fromIata: string; toIata: string; distKm: number }; leg1: Leg[]; leg2: Leg[] };

function buildGroups(r: SearchResp): Group[] {
  const direct: Leg[] = [];
  const hubs = new Map<string, { ground?: Group["ground"]; l1: Leg[]; l2: Leg[] }>();
  for (const it of r.itineraries) {
    if (it.kind === "direct") {
      direct.push(it.legs[0]);
      continue;
    }
    const key = it.kind === "nearby" ? `${it.hubIata}~${it.ground?.toIata}` : it.hubIata || "?";
    const g = hubs.get(key) ?? { ground: it.ground, l1: [], l2: [] };
    g.l1.push(it.legs[0]);
    if (it.legs[1]) g.l2.push(it.legs[1]);
    hubs.set(key, g);
  }
  const out: Group[] = [];
  if (direct.length) out.push({ key: "direct", label: "Прямые", leg1: uniqueLegs(direct), leg2: [] });
  for (const [key, g] of hubs) {
    const hub = key.split("~")[0];
    out.push({
      key,
      label: g.ground ? `Через ${hub} + наземка ${g.ground.toIata}` : `Через ${hub}`,
      ground: g.ground,
      leg1: uniqueLegs(g.l1),
      leg2: uniqueLegs(g.l2),
    });
  }
  return out;
}

function Chip({ leg }: { leg: Leg }) {
  return (
    <button
      onClick={() => window.open(deeplink(leg), "_blank", "noopener")}
      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition active:scale-95"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
      title={`${leg.fromIata}→${leg.toIata} ${legDate(leg)}`}
    >
      <span className="font-mono font-semibold">{leg.flightNo || "—"}</span>
      <span style={{ color: "var(--hint)" }}>{clock(leg.depLocal)}</span>
      <span className="truncate" style={{ color: "var(--hint)" }}>{carrierName(leg.airlineIata)}</span>
      <ExternalLink size={11} className="shrink-0 text-emerald-500" />
    </button>
  );
}

export function MapSheet({ result, onClose }: { result: SearchResp; onClose: () => void }) {
  const groups = buildGroups(result);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl border shadow-xl sm:rounded-2xl"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-base font-semibold">
              <span className="font-mono">{result.origin}</span>
              <ArrowRight size={15} className="text-emerald-500" />
              <span className="font-mono">{result.dest}</span>
            </div>
            <div className="truncate text-xs" style={{ color: "var(--hint)" }}>Карта рейсов · жми рейс → билеты</div>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1.5 transition active:scale-90" style={{ color: "var(--hint)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {groups.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--hint)" }}>Нет вариантов для карты.</div>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => (
                <div key={g.key} className="flex flex-col gap-2 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <div className="text-sm font-semibold">{g.label}</div>
                  {g.key === "direct" ? (
                    <div className="flex flex-wrap gap-2">{g.leg1.map((l, i) => <Chip key={i} leg={l} />)}</div>
                  ) : (
                    <>
                      <div className="text-[11px] font-medium" style={{ color: "var(--hint)" }}>
                        {result.origin} → {g.key.split("~")[0]}
                      </div>
                      <div className="flex flex-wrap gap-2">{g.leg1.map((l, i) => <Chip key={i} leg={l} />)}</div>
                      {g.ground && (
                        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--hint)" }}>
                          <Car size={12} className="text-amber-500" /> наземка {g.ground.fromIata} → {g.ground.toIata} (~{g.ground.distKm} км)
                        </div>
                      )}
                      <div className="text-[11px] font-medium" style={{ color: "var(--hint)" }}>
                        {g.ground ? g.ground.toIata : g.key.split("~")[0]} → {result.dest}
                      </div>
                      <div className="flex flex-wrap gap-2">{g.leg2.map((l, i) => <Chip key={i} leg={l} />)}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
