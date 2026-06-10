"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Loader2,
  Lock,
  ArrowRight,
  Plane,
  Car,
  History as HistoryIcon,
  Trash2,
  Clock,
} from "lucide-react";
import { AirportPicker } from "@/components/AirportPicker";
import { apiFetch, initTelegram, telegramUserId } from "@/lib/client";
import { type Airport, carrierName } from "@/lib/types";

type Leg = {
  fromIata: string;
  toIata: string;
  depLocal: string | null;
  arrLocal: string | null;
  airlineIata: string | null;
  airlineName: string | null;
  flightNo: string | null;
};
type Ground = { fromIata: string; toIata: string; distKm: number; estMin: number };
type Itinerary = {
  kind: "direct" | "hub" | "nearby";
  legs: Leg[];
  ground?: Ground;
  layoverMin?: number;
  hubIata?: string;
};
type SearchResp = {
  id: string;
  origin: string;
  dest: string;
  tStart: string;
  itineraries: Itinerary[];
};
type SearchRow = { id: string; originCode: string; destCode: string; tStart: string; createdAt: string };

const fmtTime = (s: string | null) => {
  if (!s) return "—";
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return s;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
};
const fmtLayover = (min?: number) =>
  min == null ? "" : `${Math.floor(min / 60)}ч ${min % 60}м`;

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function Home() {
  const [from, setFrom] = useState<Airport | null>(null);
  const [to, setTo] = useState<Airport | null>(null);
  const [date, setDate] = useState(todayDate());
  const [time, setTime] = useState("06:00");
  const [maxLayoverH, setMaxLayoverH] = useState(6);
  const [maxDistKm, setMaxDistKm] = useState(100);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResp | null>(null);
  const [history, setHistory] = useState<SearchRow[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/searches");
      if (res.status === 403) return setForbidden(true);
      if (res.ok) setHistory(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    initTelegram();
    loadHistory();
  }, [loadHistory]);

  async function runSearch() {
    if (!from || !to || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originCode: from.code,
          destCode: to.code,
          tStart: `${date}T${time}`,
          maxDistKm,
          maxLayoverMin: maxLayoverH * 60,
        }),
      });
      const data = await res.json();
      if (res.status === 403) return setForbidden(true);
      if (!res.ok) throw new Error(data.error || "Ошибка поиска");
      setResult(data);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(id: string) {
    try {
      const res = await apiFetch(`/api/searches/${id}`);
      if (res.ok) {
        setResult(await res.json());
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      /* ignore */
    }
  }

  async function deleteHistory(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await apiFetch(`/api/searches/${id}`, { method: "DELETE" });
    if (result?.id === id) setResult(null);
    await loadHistory();
  }

  if (forbidden) {
    const id = telegramUserId();
    return (
      <main
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: "var(--bg)", color: "var(--text)" }}
      >
        <Lock size={30} className="text-emerald-500" />
        <p className="text-base font-medium">Доступ ограничен</p>
        <p className="max-w-xs text-sm" style={{ color: "var(--hint)" }}>
          Приложение доступно только избранным. Отправьте свой Telegram-ID администратору.
        </p>
        {id && (
          <div
            className="rounded-xl border px-4 py-2 font-mono text-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            ID: {id}
          </div>
        )}
      </main>
    );
  }

  const fieldStyle = { background: "var(--bg)", borderColor: "var(--border)" };

  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center px-4 py-6"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <header className="flex items-center gap-2 pt-2">
          <Plane size={22} className="text-emerald-500" />
          <h1 className="text-2xl font-bold tracking-tight">Маршруты с пересадкой</h1>
        </header>

        <div
          className="flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <AirportPicker label="Откуда" value={from} onChange={setFrom} />
          <AirportPicker label="Куда" value={to} onChange={setTo} />

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--hint)" }}>
                Дата
              </label>
              <input
                type="date"
                value={date}
                min={todayDate()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                style={fieldStyle}
              />
            </div>
            <div className="w-28">
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--hint)" }}>
                Не раньше
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                style={fieldStyle}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--hint)" }}>
                Макс. пересадка (ч)
              </label>
              <input
                type="number"
                min={1}
                max={48}
                value={maxLayoverH}
                onChange={(e) => setMaxLayoverH(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                style={fieldStyle}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--hint)" }}>
                Радиус соседних (км)
              </label>
              <input
                type="number"
                min={0}
                max={1000}
                step={10}
                value={maxDistKm}
                onChange={(e) => setMaxDistKm(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                style={fieldStyle}
              />
            </div>
          </div>

          <button
            onClick={runSearch}
            disabled={!from || !to || busy}
            className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {busy ? "Ищу маршруты…" : "Найти маршруты"}
          </button>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1 text-base font-semibold">
              <span className="font-mono">{result.origin}</span>
              <ArrowRight size={16} className="text-emerald-500" />
              <span className="font-mono">{result.dest}</span>
              <span className="ml-auto text-sm font-normal" style={{ color: "var(--hint)" }}>
                {result.itineraries.length} вариантов
              </span>
            </div>

            {result.itineraries.length === 0 && (
              <div
                className="rounded-2xl border p-6 text-center text-sm"
                style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--hint)" }}
              >
                Ничего не найдено. Попробуй больше радиус / время пересадки / другое время.
              </div>
            )}

            {result.itineraries.map((it, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-2xl border p-3.5 shadow-sm"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: it.kind === "direct" ? "rgb(16 185 129 / 0.15)" : "var(--bg)",
                      color: it.kind === "direct" ? "rgb(5 150 105)" : "var(--hint)",
                    }}
                  >
                    {it.kind === "direct" ? "Прямой" : it.kind === "hub" ? `Через ${it.hubIata}` : `Через ${it.hubIata}+`}
                  </span>
                  {it.layoverMin != null && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--hint)" }}>
                      <Clock size={12} /> пересадка {fmtLayover(it.layoverMin)}
                    </span>
                  )}
                </div>

                <LegRow leg={it.legs[0]} />
                {it.ground && (
                  <div className="flex items-center gap-2 pl-1 text-xs" style={{ color: "var(--hint)" }}>
                    <Car size={13} className="text-amber-500" />
                    {it.ground.fromIata} → {it.ground.toIata} · ~{it.ground.distKm} км, ~{it.ground.estMin} мин
                  </div>
                )}
                {it.legs[1] && <LegRow leg={it.legs[1]} />}
              </div>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1 text-sm font-medium" style={{ color: "var(--hint)" }}>
              <HistoryIcon size={15} /> История поиска
            </div>
            {history.map((h) => (
              <div
                key={h.id}
                onClick={() => openHistory(h.id)}
                className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition active:scale-[0.99]"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{h.originCode}</span>
                  <ArrowRight size={13} className="shrink-0 text-emerald-500" />
                  <span className="font-mono text-sm font-semibold">{h.destCode}</span>
                  <span className="ml-2 truncate text-xs" style={{ color: "var(--hint)" }}>
                    {fmtTime(h.tStart)}
                  </span>
                </div>
                <button
                  onClick={(e) => deleteHistory(h.id, e)}
                  aria-label="Удалить"
                  className="rounded-lg p-1.5 transition active:scale-90"
                  style={{ color: "var(--hint)" }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
