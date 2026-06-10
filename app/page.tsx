"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Loader2,
  Lock,
  ArrowRight,
  Plane,
  History as HistoryIcon,
  Trash2,
  CalendarDays,
} from "lucide-react";
import { AirportPicker } from "@/components/AirportPicker";
import { apiFetch, initTelegram, telegramUserId } from "@/lib/client";
import type { Airport, SearchResult } from "@/lib/types";

type SearchRow = {
  id: string;
  originCode: string;
  destCode: string;
  dateFrom: string;
  dateTo: string;
  currency: string;
  createdAt: string;
};

// Build a [first..last] date range for a YYYY-MM month, never starting before today.
function monthRange(m: string): { dateFrom: string; dateTo: string } {
  const [y, mo] = m.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return { dateFrom: first < today ? today : first, dateTo: last };
}

function defaultMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function maxMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const fmtMonth = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default function Home() {
  const [from, setFrom] = useState<Airport | null>(null);
  const [to, setTo] = useState<Airport | null>(null);
  const [month, setMonth] = useState(defaultMonth());
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [history, setHistory] = useState<SearchRow[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/searches");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
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
    const { dateFrom, dateTo } = monthRange(month);
    try {
      const res = await apiFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originCode: from.code,
          destCode: to.code,
          dateFrom,
          dateTo,
        }),
      });
      const data = await res.json();
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
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
    setError(null);
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
          Приложение пока доступно только избранным. Отправьте свой Telegram-ID
          администратору, чтобы получить доступ.
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

  const available = result?.days.filter((d) => d.available) ?? [];

  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center px-4 py-6"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <header className="flex items-center gap-2 pt-2">
          <Plane size={22} className="text-emerald-500" />
          <h1 className="text-2xl font-bold tracking-tight">Прямые рейсы</h1>
        </header>

        {/* search form */}
        <div
          className="flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <AirportPicker label="Откуда" value={from} onChange={setFrom} />
          <AirportPicker label="Куда" value={to} onChange={setTo} />

          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--hint)" }}
            >
              Месяц
            </label>
            <input
              type="month"
              value={month}
              min={thisMonth()}
              max={maxMonth()}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-xl border px-3 py-3 text-base outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              style={{ background: "var(--bg)", borderColor: "var(--border)" }}
            />
          </div>

          <button
            onClick={runSearch}
            disabled={!from || !to || busy}
            className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {busy ? "Ищу прямые рейсы…" : "Найти прямые рейсы"}
          </button>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* result */}
        {result && (
          <div
            className="flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2 text-base font-semibold">
              <span className="font-mono">{result.originCode}</span>
              <ArrowRight size={16} className="text-emerald-500" />
              <span className="font-mono">{result.destCode}</span>
              <span className="ml-auto text-sm font-normal" style={{ color: "var(--hint)" }}>
                {fmtMonth(result.dateFrom.slice(0, 7))}
              </span>
            </div>

            {available.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 py-8 text-center text-sm"
                style={{ color: "var(--hint)" }}
              >
                <CalendarDays size={24} />
                <p>
                  Прямых рейсов не найдено за этот месяц.
                  <br />
                  (источник: Ryanair — другие авиакомпании добавим позже)
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm" style={{ color: "var(--hint)" }}>
                  Прямые рейсы в {available.length}{" "}
                  {available.length === 1 ? "день" : "дн."} из {result.days.length}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {available.map((d) => (
                    <div
                      key={d.date}
                      className="flex flex-col gap-0.5 rounded-xl border px-3 py-2.5"
                      style={{ background: "var(--bg)", borderColor: "var(--border)" }}
                    >
                      <span className="text-sm font-medium capitalize">
                        {fmtDay(d.date)}
                      </span>
                      <span className="text-sm font-semibold text-emerald-600">
                        {d.price != null
                          ? `${d.price} ${d.currency}`
                          : "есть рейс"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* history */}
        {history.length > 0 && (
          <div className="flex flex-col gap-2">
            <div
              className="flex items-center gap-2 px-1 text-sm font-medium"
              style={{ color: "var(--hint)" }}
            >
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
                    {fmtMonth(h.dateFrom.slice(0, 7))}
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
