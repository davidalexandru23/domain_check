import { spawn } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

export const nowIso = () => new Date().toISOString();

export const id = () => crypto.randomUUID();

export const normalizeTarget = (target: string) => {
  const trimmed = target.trim().toLowerCase();
  const withoutScheme = trimmed.replace(/^https?:\/\//, "");
  return withoutScheme.split("/")[0].replace(/:\d+$/, "");
};

export const isIp = (value: string) => net.isIP(value) !== 0;

export const unique = <T>(values: T[]) => Array.from(new Set(values.filter(Boolean)));

export const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  const timeout = sleep(ms).then(() => {
    throw new Error(`${label} timeout after ${ms}ms`);
  });
  return Promise.race([promise, timeout]) as Promise<T>;
};

export const fetchJson = async <T>(url: string, timeoutMs: number): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "domain-asm-osint/1.0 defensive scanner" }
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
};

export const fetchText = async (url: string, timeoutMs: number): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "domain-asm-osint/1.0 defensive scanner" },
      redirect: "follow"
    });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};

export const runCommand = (command: string, args: string[], timeoutMs: number) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.stderr.on("data", (data) => {
      stderr += String(data);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: error.message });
    });
  });

export const limitList = <T>(values: T[], max: number) => values.slice(0, Math.max(0, max));

export const delayByPolicy = (ms: number) => sleep(Math.max(0, ms));

export const classifyProvider = (org?: string) => {
  const value = (org ?? "").toLowerCase();
  if (/(cloudflare|akamai|fastly|cloudfront|cdn77|bunny)/.test(value)) return "cdn" as const;
  if (/(amazon|aws|google|microsoft|azure|digitalocean|linode|hetzner|ovh|oracle|vultr)/.test(value)) return "cloud" as const;
  if (/(telecom|communications|broadband|internet|isp|cable)/.test(value)) return "isp" as const;
  if (value) return "enterprise" as const;
  return "unknown" as const;
};

export const stripHtml = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");

export const extractEmailContext = (text: string, email: string, radius: number = 70): string => {
  if (!text || !email) return "";
  const lowerText = text.toLowerCase();
  const lowerEmail = email.toLowerCase();
  let index = lowerText.indexOf(lowerEmail);
  if (index === -1) {
    const local = lowerEmail.split("@")[0];
    if (local && local.length >= 2) {
      index = lowerText.indexOf(local);
    }
  }
  if (index === -1) {
    const trimmed = text.slice(0, 140).trim();
    return trimmed ? (trimmed.length < text.length ? trimmed + "..." : trimmed) : "";
  }
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + email.length + radius);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
};

