import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";
import { z } from "zod";
import type { ScanProgress, ScanRequest } from "../shared/types.js";
import { serverConfig } from "./config.js";
import { runScan } from "./scanner.js";
import { scanStore } from "./store.js";
import { id, nowIso, normalizeTarget } from "./utils.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/api/scans/ws" });
const clients = new Map<string, Set<WebSocket>>();

const scanRequestSchema = z.object({
  target: z.string().min(1).max(253),
  mode: z.enum(["passive", "controlled-active", "active-discovery", "network-map", "dns-only"]).default("controlled-active"),
  options: z
    .object({
      nmap: z.boolean().optional(),
      traceroute: z.boolean().optional(),
      smtpHandshake: z.boolean().optional(),
      dnsBruteforce: z.boolean().optional(),
      vhostProbe: z.boolean().optional(),
      httpFingerprint: z.boolean().optional(),
      tlsInspect: z.boolean().optional(),
      bannerGrab: z.boolean().optional(),
      infrastructureTrace: z.boolean().optional(),
      maxPorts: z.number().int().min(1).max(100).optional(),
      maxHosts: z.number().int().min(1).max(100).optional(),
      maxDepth: z.number().int().min(0).max(100000).optional(),
      concurrency: z.number().int().min(1).max(8).optional(),
      rateLimit: z.number().int().min(0).max(5000).optional(),
      timeoutMs: z.number().int().min(3000).max(60000).optional()
    })
    .partial()
    .optional()
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const broadcast = (scanId: string, progress: ScanProgress) => {
  const sockets = clients.get(scanId);
  if (!sockets) return;
  for (const socket of sockets) {
    socket.send(JSON.stringify(progress));
  }
};

wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "", "http://localhost");
  const scanId = url.searchParams.get("scanId");
  if (!scanId) {
    socket.close();
    return;
  }
  const set = clients.get(scanId) ?? new Set<WebSocket>();
  set.add(socket as unknown as WebSocket);
  clients.set(scanId, set);
  socket.on("close", () => {
    set.delete(socket as unknown as WebSocket);
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, at: nowIso() });
});

app.get("/api/scans", (_req, res) => {
  res.json(scanStore.list());
});

app.post("/api/scans", (req, res) => {
  const parsed = scanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const scanId = id();
  const requestBody: ScanRequest = {
    target: normalizeTarget(parsed.data.target),
    mode: parsed.data.mode,
    options: parsed.data.options
  };
  const job = scanStore.create({
    id: scanId,
    request: requestBody,
    status: "queued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    progress: []
  });
  res.status(202).json(job);

  queueMicrotask(async () => {
    scanStore.update(scanId, { status: "running" });
    const emit = (event: Omit<ScanProgress, "scanId" | "at">) => {
      const progress: ScanProgress = { ...event, scanId, at: nowIso() };
      scanStore.pushProgress(scanId, progress);
      broadcast(scanId, progress);
    };
    try {
      const result = await runScan(requestBody, emit);
      scanStore.update(scanId, { status: "done", result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "scan failed";
      scanStore.update(scanId, { status: "failed", error: message });
      emit({ status: "failed", stage: "failed", message, percent: 100 });
    }
  });
});

app.get("/api/scans/:id", (req, res) => {
  const job = scanStore.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "scan not found" });
    return;
  }
  res.json(job);
});

app.get("/api/scans/:id/events", (req, res) => {
  const job = scanStore.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "scan not found" });
    return;
  }
  res.json(job.progress);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__dirname, "../../dist");
app.use(express.static(staticDir));
app.use((_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

server.listen(serverConfig.port, "127.0.0.1", () => {
  console.log(`Domain ASM OSINT listening on ${serverConfig.port}`);
});
