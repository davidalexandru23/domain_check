# Project Architecture & Implementation Plan — domain_check

## Architecture
`domain_check` is a domain intelligence & network scanning web application with a TypeScript Node.js backend (`src/server/`) and a React frontend (`src/client/`).
- **Shared Types**: `src/shared/types.ts` defines data contracts (`EmailFinding`, `InfrastructureSupplyChain`, `ScanMode`, `ActiveOptions`).
- **Server Engine**: `src/server/scanner.ts` orchestrates scanning modules (`search.ts`, `email.ts`, `infrastructure.ts`, `ip.ts`, `domain.ts`, `dns.ts`, etc.).
- **Client Application**: `src/client/main.tsx` provides scan parameter selection, active control toggles, and results dashboard tables.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1. Enhanced Email Hunter | Capture and display detailed source context/snippets for emails in `search.ts`, `email.ts`, `scanner.ts`, and `main.tsx`. | M1 | survey |
| 2 | R2. Subleased Infrastructure Fix | Debug and fix infrastructure owner inference regression in `infrastructure.ts`, `ip.ts`, and `utils.ts` for targets like `edu.gov.ro`. | M2 | survey |
| 3 | R3. Active Discovery UI Force | Update `main.tsx` React component so selecting active-discovery mode visually forces and locks all toggles to checked. | M3 | survey |
| 4 | E2E & Build Pipeline Verification | Full build (`npm run build`, `npm run server:build`), unit tests (`npm test`), and live scan verification against `edu.gov.ro`. | M4 | survey |

## Code Layout
- `src/server/modules/search.ts`: Email dorking & web crawling search engine integration.
- `src/server/modules/email.ts`: Direct email harvesting & crawling.
- `src/server/modules/infrastructure.ts`: Infrastructure supply chain analysis & lease signal evaluation.
- `src/server/modules/ip.ts`: IP enrichment, RDAP parsing, ASN lookup.
- `src/server/modules/utils.ts`: Classification & organization similarity utilities.
- `src/server/scanner.ts`: Core scanner engine aggregating scan modules.
- `src/client/main.tsx`: React client UI components, state management, and data tables.
- `src/shared/types.ts`: Shared TypeScript interfaces and types.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Enhanced Email Hunter | Refactor `search.ts`, `email.ts`, `scanner.ts`, `main.tsx` to extract & render email context snippets | none | DONE |
| 2 | M2: Subleased Infrastructure Fix | Fix `infrastructure.ts`, `ip.ts`, `utils.ts` RDAP parsing, RIPE stat string handling, and lease signals | none | DONE |
| 3 | M3: Active Discovery UI Force | Update `main.tsx` `Toggle` component and mode selection handler to force and lock all active toggles | none | DONE |
| 4 | M4: Final Integration & E2E Testing | Execute builds (`server:build`, `build`), run tests, verify live scan scenario on `edu.gov.ro` | M1, M2, M3 | DONE |


## Interface Contracts
### `EmailFinding` (`src/shared/types.ts`)
```ts
export type EmailFinding = {
  email: string;
  sourceUrl: string;
  sourceType: "html" | "dns" | "whois" | "mx" | "txt";
  context?: string;
  role: "general" | "sales" | "support" | "security" | "hr" | "person" | "unknown";
  validity: "valid-mx" | "smtp-accepted" | "smtp-rejected" | "blocked" | "unknown";
};
```
- `context`: ~140-160 character text snippet centered around the email match.
- Backend modules (`search.ts`, `email.ts`, `scanner.ts`) must populate `context`.
- Client `main.tsx` must display `context` in the Email Hunter table.

### `Toggle` component (`src/client/main.tsx`)
```tsx
function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean })
```
- When `mode === "active-discovery"`, all 17 active control toggles must have `value={true}` and `disabled={true}` with `opacity-60 cursor-not-allowed` visual styling.
