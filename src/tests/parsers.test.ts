import { describe, expect, it } from "vitest";
import { mergeOptions } from "../server/scanner.js";
import { classifyLeaseSignalsForTest } from "../server/modules/infrastructure.js";

describe("scan options", () => {
  it("clamps active limits", () => {
    const options = mergeOptions({ maxHosts: 999, maxPorts: 999, maxDepth: 99, concurrency: 99, timeoutMs: 1 });
    expect(options.maxHosts).toBe(100);
    expect(options.maxPorts).toBe(100);
    expect(options.maxDepth).toBe(30);
    expect(options.concurrency).toBe(8);
    expect(options.timeoutMs).toBe(3000);
  });
});



describe("infrastructure lease signals", () => {
  it("detects in-house infrastructure", () => {
    const signals = classifyLeaseSignalsForTest({
      ip: "203.0.113.10",
      ptr: [],
      asn: { asn: "64500", org: "Example Corp" },
      geo: {},
      providerType: "enterprise",
      rirAllocationOwner: "Example Corporation",
      upstreams: [],
      peers: [],
      ixPresence: [],
      facilityPresence: [],
      sources: []
    }, "Example Corp");
    expect(signals.some((signal) => signal.kind === "in-house")).toBe(true);
  });

  it("detects direct cloud or cdn provider", () => {
    const signals = classifyLeaseSignalsForTest({
      ip: "203.0.113.20",
      ptr: [],
      asn: { asn: "13335", org: "Cloudflare, Inc." },
      geo: {},
      providerType: "cdn",
      rirAllocationOwner: "Cloudflare, Inc.",
      upstreams: [],
      peers: [],
      ixPresence: [],
      facilityPresence: [],
      sources: []
    }, "Client Business SRL");
    expect(signals.some((signal) => signal.kind === "cdn-proxy")).toBe(true);
  });

  it("detects likely subleased network", () => {
    const signals = classifyLeaseSignalsForTest({
      ip: "203.0.113.30",
      ptr: [],
      asn: { asn: "64510", org: "Hosting Reseller" },
      geo: {},
      providerType: "enterprise",
      rirAllocationOwner: "Parent Network Operator",
      upstreams: [],
      peers: [],
      ixPresence: [],
      facilityPresence: [],
      sources: []
    }, "Client Business SRL");
    expect(signals.some((signal) => signal.kind === "subleased")).toBe(true);
  });

  it("detects suballocated origin mismatch", () => {
    const signals = classifyLeaseSignalsForTest({
      ip: "203.0.113.40",
      ptr: [],
      asn: { asn: "64520", org: "Network Owner" },
      geo: {},
      providerType: "enterprise",
      originAsn: "64521",
      upstreams: [],
      peers: [],
      ixPresence: [],
      facilityPresence: [],
      sources: []
    }, "Client Business SRL");
    expect(signals.some((signal) => signal.kind === "suballocated")).toBe(true);
  });

  it("detects enterprise/ISP direct hosting provider infrastructure (e.g. AS3233 ICI Bucuresti)", () => {
    const signals = classifyLeaseSignalsForTest({
      ip: "193.230.5.163",
      ptr: ["edu.gov.ro"],
      asn: { asn: "3233", org: "Institutul National de Cercetare-Dezvoltare in informatica - ICI Bucuresti" },
      geo: {},
      providerType: "enterprise",
      rirAllocationOwner: "Institutul National de Cercetare-Dezvoltare in Informatica - ICI Bucuresti",
      upstreams: [],
      peers: [],
      ixPresence: [],
      facilityPresence: [],
      sources: []
    }, undefined);
    expect(signals.some((signal) => signal.kind === "direct-provider")).toBe(true);
    expect(signals.some((signal) => signal.kind === "subleased")).toBe(false);
  });
});
