"use client";

import type { ReactNode } from "react";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${response.status}).`);
  return data as T;
}

// A-share convention: red means up, green means down.
export function signClass(value: number) {
  if (value > 0) return "text-[#c62f2f]";
  if (value < 0) return "text-[#13804a]";
  return "text-[var(--muted)]";
}

export function money(value: number, digits = 2) {
  return `¥${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function signed(value: number, suffix = "%") {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

export function Card({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-white/55 p-3 sm:p-4">
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="text-base font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--panel)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`truncate text-base font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export function Button({ variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "buy" | "sell" | "danger" }) {
  const styles = {
    primary: "bg-[var(--accent)] text-[var(--accent-ink)]",
    ghost: "border border-[var(--line)] bg-white/50 text-[var(--ink)] hover:bg-white/80",
    buy: "bg-[#c62f2f] text-white",
    sell: "bg-[#13804a] text-white",
    danger: "border border-[var(--danger)] bg-white/50 text-[var(--danger)]",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    />
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const styles = {
    info: "bg-[var(--panel-strong)] text-[var(--muted)]",
    warn: "border border-[var(--warning)] bg-[#fff4e6] text-[var(--warning)]",
    error: "border border-[var(--danger)] bg-[#fdecef] text-[var(--danger)]",
  }[tone];
  return <p className={`rounded-md p-3 text-sm leading-6 ${styles}`}>{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">{children}</p>;
}
