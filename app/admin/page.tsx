"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Trash2, Loader2, Lock, ArrowLeft, Power } from "lucide-react";
import Link from "next/link";
import { apiFetch, initTelegram } from "@/lib/client";

type Token = {
  id: string;
  label: string;
  keyMask: string;
  enabled: boolean;
  unitsLimit: number;
  unitsRemaining: number;
  requestsLimit: number;
  requestsRemaining: number;
  resetAt: string | null;
  lastUsedAt: string | null;
};

function resetIn(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.round((Date.parse(iso) - Date.now()) / 86400000);
  return days <= 0 ? "скоро" : `${days} дн`;
}

export default function AdminPage() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/tokens");
      if (res.status === 403) return setForbidden(true);
      if (res.ok) setTokens(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    initTelegram();
    load();
  }, [load]);

  async function add() {
    if (!label.trim() || !key.trim() || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), key: key.trim() }),
      });
      if (res.ok) {
        setLabel("");
        setKey("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: Token) {
    await apiFetch(`/api/admin/tokens/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !t.enabled }),
    });
    await load();
  }

  async function rename(t: Token) {
    const next = prompt("Новое название", t.label);
    if (next == null || !next.trim() || next.trim() === t.label) return;
    await apiFetch(`/api/admin/tokens/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: next.trim() }),
    });
    await load();
  }

  async function replaceKey(t: Token) {
    const next = prompt(`Новый ключ для «${t.label}» (пусто = отмена)`, "");
    if (next == null || !next.trim()) return;
    await apiFetch(`/api/admin/tokens/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: next.trim() }),
    });
    await load();
  }

  async function remove(t: Token) {
    if (!confirm(`Удалить токен «${t.label}»?`)) return;
    await apiFetch(`/api/admin/tokens/${t.id}`, { method: "DELETE" });
    await load();
  }

  if (forbidden) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: "var(--bg)", color: "var(--text)" }}>
        <Lock size={30} className="text-emerald-500" />
        <p className="text-base font-medium">Нет доступа</p>
        <Link href="/" className="text-sm text-emerald-600">← На главную</Link>
      </main>
    );
  }

  const field = { background: "var(--bg)", borderColor: "var(--border)" };

  return (
    <main className="flex min-h-[100dvh] flex-col items-center px-4 py-6" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <header className="flex items-center gap-2 pt-2">
          <Link href="/" aria-label="Назад" className="rounded-lg p-1 transition active:scale-90" style={{ color: "var(--hint)" }}>
            <ArrowLeft size={20} />
          </Link>
          <KeyRound size={20} className="text-emerald-500" />
          <h1 className="text-xl font-bold tracking-tight">Токены AeroDataBox</h1>
        </header>

        {/* add form */}
        <div className="flex flex-col gap-3 rounded-2xl border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Название (напр. acc-2)" className="w-full rounded-xl border px-3 py-2.5 text-base outline-none" style={field} />
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="RapidAPI ключ" className="w-full rounded-xl border px-3 py-2.5 font-mono text-sm outline-none" style={field} />
          <button onClick={add} disabled={!label.trim() || !key.trim() || busy} className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Добавить токен
          </button>
        </div>

        {/* list */}
        {tokens == null ? (
          <div className="py-10 text-center text-sm" style={{ color: "var(--hint)" }}>Загрузка…</div>
        ) : tokens.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "var(--hint)" }}>Токенов пока нет.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {tokens.map((t) => {
              const pct = t.unitsLimit ? t.unitsRemaining / t.unitsLimit : 0;
              const color = pct > 0.3 ? "text-emerald-600" : pct > 0.1 ? "text-amber-500" : "text-red-500";
              return (
                <div key={t.id} className="flex flex-col gap-2 rounded-2xl border p-3" style={{ background: "var(--card)", borderColor: "var(--border)", opacity: t.enabled ? 1 : 0.55 }}>
                  <div className="flex items-center gap-2">
                    <button onClick={() => rename(t)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{t.label}</button>
                    <span className="font-mono text-xs" style={{ color: "var(--hint)" }}>{t.keyMask}</span>
                    <button onClick={() => toggle(t)} aria-label="Вкл/выкл" className={`rounded-lg p-1.5 transition active:scale-90 ${t.enabled ? "text-emerald-500" : "text-gray-400"}`}>
                      <Power size={16} />
                    </button>
                    <button onClick={() => remove(t)} aria-label="Удалить" className="rounded-lg p-1.5 transition active:scale-90" style={{ color: "var(--hint)" }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--hint)" }}>
                    <span>units <span className={`font-mono font-semibold ${color}`}>{t.unitsRemaining}</span>/{t.unitsLimit}</span>
                    <span>req {t.requestsRemaining}/{t.requestsLimit}</span>
                    <span>сброс {resetIn(t.resetAt)}</span>
                    <button onClick={() => replaceKey(t)} className="text-emerald-600">сменить ключ</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
