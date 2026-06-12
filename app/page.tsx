"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Loader2, Lock, ArrowRight, Plane, History as HistoryIcon, Trash2 } from "lucide-react";
import { AirportPicker } from "@/components/AirportPicker";
import { QuotaBadge } from "@/components/QuotaBadge";
import { ResultsSheet, type SearchResp } from "@/components/ResultsSheet";
import { apiFetch, initTelegram, telegramUserId } from "@/lib/client";
import type { Airport } from "@/lib/types";

type SearchRow = { id: string; originCode: string; destCode: string; dateFrom: string; dateTo: string; createdAt: string };

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysStr(d: string, n: number) {
  return new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}

export default function Home() {
  const [from, setFrom] = useState<Airport | null>(null);
  const [to, setTo] = useState<Airport | null>(null);
  const [dateFrom, setDateFrom] = useState(todayDate());
  const [dateTo, setDateTo] = useState(addDaysStr(todayDate(), 2));
  const [maxLayoverH, setMaxLayoverH] = useState(8);
  const [maxDistKm, setMaxDistKm] = useState(100);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SearchResp | null>(null); // open results popover
  const [history, setHistory] = useState<SearchRow[]>([]);
  const [quotaKey, setQuotaKey] = useState(0); // bump → QuotaBadge refetches

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
    try {
      const res = await apiFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originCode: from.code,
          destCode: to.code,
          dateFrom,
          dateTo,
          maxDistKm,
          maxLayoverMin: maxLayoverH * 60,
        }),
      });
      const data = await res.json();
      if (res.status === 403) return setForbidden(true);
      if (!res.ok) throw new Error(data.error || "Ошибка поиска");
      setSheet(data); // open popover with results
      setQuotaKey((k) => k + 1); // search consumed api-units → refresh badge
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
      if (res.ok) setSheet(await res.json()); // open popover
    } catch {
      /* ignore */
    }
  }

  async function deleteHistory(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await apiFetch(`/api/searches/${id}`, { method: "DELETE" });
    if (sheet?.id === id) setSheet(null);
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
          <Plane size={22} className="shrink-0 text-emerald-500" />
          <h1 className="flex-1 text-2xl font-bold tracking-tight">Маршруты с пересадкой</h1>
          <QuotaBadge refreshKey={quotaKey} />
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
                Период с
              </label>
              <input
                type="date"
                value={dateFrom}
                min={todayDate()}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  if (e.target.value > dateTo) setDateTo(e.target.value);
                }}
                className="w-full rounded-xl border px-3 py-3 text-base outline-none"
                style={fieldStyle}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--hint)" }}>
                по
              </label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
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
                    {h.dateFrom}…{h.dateTo}
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

      {sheet && <ResultsSheet result={sheet} onClose={() => setSheet(null)} />}
    </main>
  );
}
