"use client";

import { useState } from "react";
import { X, ArrowLeft, ArrowRight, Plane, Car, Clock, CalendarX, Map as MapIcon, ExternalLink, BarChart2, Loader2 } from "lucide-react";
import { carrierName } from "@/lib/types";
import { googleFlights, dateOf } from "@/lib/deeplink";
import { apiFetch } from "@/lib/client";
import { MapSheet } from "@/components/MapSheet";

const openGoogle = (o: string, d: string, local: string | null) =>
  window.open(googleFlights(o, d, dateOf(local)), "_blank", "noopener");

export type Leg = {
  fromIata: string;
  toIata: string;
  fromName: string | null;
  toName: string | null;
  depLocal: string | null;
  arrLocal: string | null;
  airlineIata: string | null;
  airlineName: string | null;
  flightNo: string | null;
};
export type Ground = { fromIata: string; toIata: string; distKm: number; estMin: number };
export type Itinerary = {
  kind: "direct" | "hub" | "nearby";
  legs: Leg[];
  ground?: Ground;
  layoverMin?: number;
  hubIata?: string;
};
export type SearchResp = {
  id: string;
  origin: string;
  dest: string;
  dateFrom: string;
  dateTo: string;
  itineraries: Itinerary[];
};

type PeerRow = { iata: string; name: string | null; city: string | null; country: string | null; flights: number };
type AnalyzeResp = {
  origin: string;
  dest: string;
  cached: boolean;
  fromOrigin: PeerRow[];
  toDest: PeerRow[];
};

export const fmtTime = (s: string | null) => {
  if (!s) return "—";
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return s;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
};
const fmtClock = (s: string | null) => {
  if (!s) return "—";
  const m = s.match(/[ T](\d{2}:\d{2})/);
  return m ? m[1] : "—";
};
export const fmtLayover = (min?: number) =>
  min == null ? "" : `${Math.floor(min / 60)}ч ${min % 60}м`;

const kindLabel = (it: Itinerary) =>
  it.kind === "direct" ? "Прямой" : it.kind === "hub" ? `Через ${it.hubIata}` : `Через ${it.hubIata} + наземка`;

function LegRow({ leg }: { leg: Leg }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Plane size={14} className="shrink-0 text-emerald-500" />
      <span className="font-mono font-semibold">{leg.fromIata}</span>
      <ArrowRight size={12} className="shrink-0" style={{ color: "var(--hint)" }} />
      <span className="font-mono font-semibold">{leg.toIata}</span>
      <span className="ml-1 truncate" style={{ color: "var(--hint)" }}>
        {carrierName(leg.airlineIata) || leg.airlineName} · {fmtTime(leg.depLocal)}→{fmtTime(leg.arrLocal)}
      </span>
    </div>
  );
}

// Full detail of one leg: airline + flight number + endpoints with local times.
function LegDetail({ leg }: { leg: Leg }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-3"
      style={{ background: "var(--bg)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Plane size={14} className="text-emerald-500" />
        {carrierName(leg.airlineIata) || leg.airlineName || "—"}
        <button
          onClick={() =>
            window.open(
              googleFlights(leg.fromIata, leg.toIata, dateOf(leg.depLocal), {
                airline: carrierName(leg.airlineIata) || leg.airlineName,
                nonstop: true,
              }),
              "_blank",
              "noopener",
            )
          }
          className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-xs text-emerald-600 transition active:scale-95"
        >
          {leg.flightNo || "рейс"} <ExternalLink size={11} />
        </button>
      </div>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-end pt-0.5 text-right">
          <span className="font-mono text-base font-semibold">{fmtClock(leg.depLocal)}</span>
          <span className="font-mono text-base font-semibold">{fmtClock(leg.arrLocal)}</span>
        </div>
        <div className="flex flex-col items-center pt-1.5">
          <span className="h-2 w-2 rounded-full border-2 border-emerald-500" />
          <span className="my-0.5 h-7 w-px" style={{ background: "var(--border)" }} />
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="leading-tight">
            <span className="font-mono font-semibold">{leg.fromIata}</span>
            {leg.fromName && <span className="ml-1 text-xs" style={{ color: "var(--hint)" }}>{leg.fromName}</span>}
          </div>
          <div className="leading-tight">
            <span className="font-mono font-semibold">{leg.toIata}</span>
            {leg.toName && <span className="ml-1 text-xs" style={{ color: "var(--hint)" }}>{leg.toName}</span>}
          </div>
        </div>
      </div>
      <div className="text-xs" style={{ color: "var(--hint)" }}>
        {fmtTime(leg.depLocal)} → {fmtTime(leg.arrLocal)}
      </div>
    </div>
  );
}

function PeerList({ title, rows }: { title: string; rows: PeerRow[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-semibold" style={{ color: "var(--hint)" }}>
        {title} <span className="font-normal">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs" style={{ color: "var(--hint)" }}>— нет в кеше</div>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((r) => (
            <div key={r.iata} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs">{r.iata}</span>
              <span className="min-w-0 flex-1 truncate">{r.city || r.name || r.iata}{r.country ? ` · ${r.country}` : ""}</span>
              <span className="text-xs tabular-nums" style={{ color: "var(--hint)" }}>{r.flights}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResultsSheet({ result, onClose }: { result: SearchResp; onClose: () => void }) {
  const [sel, setSel] = useState<Itinerary | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyze, setAnalyze] = useState<AnalyzeResp | null>(null);
  const items = result.itineraries;

  async function runAnalyze() {
    setAnalyzing(true);
    try {
      const res = await apiFetch(`/api/searches/${result.id}/analyze`);
      if (res.ok) setAnalyze(await res.json());
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl border shadow-xl sm:rounded-2xl"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          {sel ? (
            <button onClick={() => setSel(null)} aria-label="Назад" className="rounded-lg p-1.5 transition active:scale-90" style={{ color: "var(--hint)" }}>
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-base font-semibold">
              <span className="font-mono">{result.origin}</span>
              <ArrowRight size={15} className="text-emerald-500" />
              <span className="font-mono">{result.dest}</span>
            </div>
            <div className="truncate text-xs" style={{ color: "var(--hint)" }}>
              {sel ? kindLabel(sel) : `${result.dateFrom}…${result.dateTo} · ${items.length} вариантов`}
            </div>
          </div>
          {!sel && items.length > 0 && (
            <button onClick={() => setShowMap(true)} aria-label="Карта рейсов" className="rounded-lg p-1.5 text-emerald-600 transition active:scale-90">
              <MapIcon size={18} />
            </button>
          )}
          <button onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1.5 transition active:scale-90" style={{ color: "var(--hint)" }}>
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {sel ? (
            // ---- DETAIL ----
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-600">{kindLabel(sel)}</span>
                {sel.layoverMin != null && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: "var(--hint)" }}>
                    <Clock size={12} /> пересадка {fmtLayover(sel.layoverMin)}
                  </span>
                )}
              </div>
              <LegDetail leg={sel.legs[0]} />
              {sel.ground && (
                <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--hint)" }}>
                  <Car size={14} className="text-amber-500" />
                  Наземка {sel.ground.fromIata} → {sel.ground.toIata} · ~{sel.ground.distKm} км, ~{sel.ground.estMin} мин
                </div>
              )}
              {sel.legs[1] && <LegDetail leg={sel.legs[1]} />}
            </div>
          ) : items.length === 0 ? (
            // ---- EMPTY ----
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm" style={{ color: "var(--hint)" }}>
                <CalendarX size={26} />
                Ничего не найдено. Попробуй больше радиус / время пересадки / другой период.
              </div>

              {!analyze && (
                <button
                  onClick={runAnalyze}
                  disabled={analyzing}
                  className="mx-auto flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition active:scale-95 disabled:opacity-60"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}
                >
                  {analyzing ? <Loader2 size={15} className="animate-spin" /> : <BarChart2 size={15} />}
                  Анализ (из кеша)
                </button>
              )}

              {analyze && !analyze.cached && (
                <div className="text-center text-xs" style={{ color: "var(--hint)" }}>
                  Нет данных в кеше за этот период.
                </div>
              )}

              {analyze && analyze.cached && (
                <div className="flex flex-col gap-4 rounded-2xl border p-3.5" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <PeerList title={`Из ${analyze.origin} летают в:`} rows={analyze.fromOrigin} />
                  <PeerList title={`В ${analyze.dest} летают из:`} rows={analyze.toDest} />
                </div>
              )}
            </div>
          ) : (
            // ---- LIST ----
            <div className="flex flex-col gap-2.5">
              {items.map((it, i) => (
                <div
                  key={i}
                  onClick={() => setSel(it)}
                  role="button"
                  tabIndex={0}
                  className="flex cursor-pointer flex-col gap-2 rounded-2xl border p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                  style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: it.kind === "direct" ? "rgb(16 185 129 / 0.15)" : "var(--card)",
                        color: it.kind === "direct" ? "rgb(5 150 105)" : "var(--hint)",
                      }}
                    >
                      {it.kind === "direct" ? "Прямой" : it.kind === "hub" ? `Через ${it.hubIata}` : `Через ${it.hubIata}+`}
                    </span>
                    {it.layoverMin != null && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: "var(--hint)" }}>
                        <Clock size={12} /> {fmtLayover(it.layoverMin)}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); openGoogle(result.origin, result.dest, it.legs[0].depLocal); }}
                      aria-label="Открыть в Google Flights"
                      className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-emerald-600 transition active:scale-90"
                    >
                      Google <ExternalLink size={12} />
                    </button>
                  </div>
                  <LegRow leg={it.legs[0]} />
                  {it.ground && (
                    <div className="flex items-center gap-2 pl-1 text-xs" style={{ color: "var(--hint)" }}>
                      <Car size={13} className="text-amber-500" />
                      {it.ground.fromIata} → {it.ground.toIata} · ~{it.ground.distKm} км
                    </div>
                  )}
                  {it.legs[1] && <LegRow leg={it.legs[1]} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    {showMap && <MapSheet result={result} onClose={() => setShowMap(false)} />}
    </>
  );
}
