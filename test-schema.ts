import { z } from "zod";

const scanRequestSchema = z.object({
  target: z.string().min(1).max(253),
  mode: z.enum(["passive", "controlled-active", "active-discovery", "network-map", "email-only", "dns-only"]).default("controlled-active"),
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
      maxDepth: z.number().int().min(0).max(30).optional(),
      concurrency: z.number().int().min(1).max(8).optional(),
      rateLimit: z.number().int().min(0).max(5000).optional(),
      timeoutMs: z.number().int().min(3000).max(60000).optional()
    })
    .partial()
});

const reqBody = {
  target: "edu.gov.ro",
  mode: "active-discovery",
  options: {
    maxDepth: 30
  }
};

const parsed = scanRequestSchema.safeParse(reqBody);
if (!parsed.success) {
  console.log("Validation failed:", parsed.error.flatten());
} else {
  console.log("Validation successful!");
}
