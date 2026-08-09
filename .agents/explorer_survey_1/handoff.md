# Handoff Report — Requirement R1 (Enhanced Email Hunter)

## 1. Observation

### Codebase Inspection Findings
- **Data Structures (`src/shared/types.ts:239-246`)**:
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
  `EmailFinding` already contains an optional `context?: string` property.

- **Search Dorking Engine (`src/server/modules/search.ts:136-170, 192-293`)**:
  - `extractEmailsFromUrl(url: string, emailRegex: RegExp, timeoutMs: number)` (lines 136–170) fetches URL HTML, calls `htmlToSearchableText(html)`, runs `text.match(emailRegex)` and returns `string[]`. It discards the page text entirely and returns only raw email strings.
  - `huntEmailsDorking(...)` (lines 192–293) returns `Promise<{ email: string; sourceUrl: string }[]>`.
  - In Phase 1 (search engine scraping, lines 253–281), when matching emails directly from search result text, `sourceUrl` is set to string `${engine.name}: ${query}` (e.g., `"Yahoo: \"@edu.gov.ro\""`). No text snippet around the email is extracted or attached.
  - In Phase 2 (crawling result URLs, lines 283–290), `extractEmailsFromUrl` returns raw emails. `addEmail(email, url)` is called with `url`, but no `context` is passed.

- **Direct Email Scraping (`src/server/modules/email.ts:60-76`)**:
  - `huntEmails` crawls target site pages via `crawlForLinks` and sets:
    ```ts
    context: page.text.slice(0, 160)
    ```
  - Line 71 takes the first 160 characters of `page.text`. For most web pages, the first 160 characters contain top-level navigation / header text (e.g. `"Acasa Despre Noi Contact..."`), rather than the contextual sentence/paragraph surrounding the email address.

- **Scanner Aggregation (`src/server/scanner.ts:209-223`)**:
  - When `options.emailDorking` is enabled, `scanner.ts` receives `dorkedEmails` from `huntEmailsDorking` and pushes them into `emails`:
    ```ts
    emails.push({ email: ext.email, sourceUrl: ext.sourceUrl, sourceType: "html", role: "unknown", validity: "unknown" });
    ```
  - Line 219 omits `context` entirely (`undefined`).
  - Line 219 hardcodes `role: "unknown"` instead of evaluating `roleFor(ext.email)`.
  - Line 219 hardcodes `validity: "unknown"` instead of inheriting MX validity (`dnsResult.mx.length ? "valid-mx" : "unknown"`).

- **Frontend Display Component (`src/client/main.tsx:280-287`)**:
  - The `Email Hunter` table renders:
    ```tsx
    <Section title="Email Hunter" icon={<Mail size={18} />}>
      <DataTable rows={result.emails.map((email) => ({
        email: email.email,
        role: email.role,
        validity: email.validity,
        source: (email.sourceType === "html" && email.sourceUrl.startsWith("http")) ? <a href={email.sourceUrl} target="_blank" rel="noreferrer" className="text-cyanx hover:underline">Link</a> : email.sourceUrl
      }))} />
    </Section>
    ```
  - The object passed to `DataTable` includes only `{ email, role, validity, source }`. The `context` field is omitted from the row object, making `DataTable` hide `context` even if provided by the backend API.

- **Isolation Testing (`scratch/test-hunter.test.ts`)**:
  - Running isolation tests against `edu.gov.ro` via Vitest confirmed that `huntEmailsDorking` returned findings `{ email: "cabinet@edu.gov.ro", sourceUrl: "https://www.edu.gov.ro/contact" }` lacking `context` snippets.

---

## 2. Logic Chain

1. **Root Cause Analysis of Insufficient Email Source Context**:
   - Primary Cause 1: `search.ts` (`extractEmailsFromUrl` and `huntEmailsDorking`) does not capture text snippets around email matches in either Phase 1 (search result text) or Phase 2 (crawled page text).
   - Primary Cause 2: `email.ts` (`huntEmails`) uses `page.text.slice(0, 160)`, which grabs static header text instead of dynamically extracting a window centered around the email match location.
   - Primary Cause 3: `scanner.ts` drops `context`, `role`, and `validity` when merging `huntEmailsDorking` results.
   - Primary Cause 4: `main.tsx` does not include `context` in the row mapping for `DataTable`.

2. **Backend to Frontend Data Contract Alignment**:
   - `EmailFinding` in `src/shared/types.ts` is the single source of truth for email results.
   - Adding a context snippet extractor (e.g. `extractEmailContext(text, email, radius)`) ensures `context` contains a clean ~140-160 character window around the target email address (e.g., `"... adrese de contact: cabinet@edu.gov.ro pentru petitii ..."`).
   - `huntEmailsDorking` return type should be updated to include `context?: string` and `sourceType?: EmailFinding["sourceType"]`.
   - `scanner.ts` must propagate `context`, `roleFor(ext.email)`, and MX validity when pushing dorked emails.
   - `main.tsx` must pass `context: email.context || "N/A"` into `DataTable`.

3. **Proposed Implementation Plan for Implementer**:

   - **Step 1: Snippet Extractor (`src/server/utils.ts` or `src/server/modules/search.ts`)**
     Create helper function `extractEmailContext`:
     ```ts
     export const extractEmailContext = (text: string, email: string, radius: number = 70): string => {
       const lowerText = text.toLowerCase();
       const lowerEmail = email.toLowerCase();
       const index = lowerText.indexOf(lowerEmail);
       if (index === -1) {
         return text.slice(0, 140).trim();
       }
       const start = Math.max(0, index - radius);
       const end = Math.min(text.length, index + email.length + radius);
       let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
       if (start > 0) snippet = "..." + snippet;
       if (end < text.length) snippet = snippet + "...";
       return snippet;
     };
     ```

   - **Step 2: Refactor `src/server/modules/search.ts`**
     - Update return types of `extractEmailsFromUrl` and `huntEmailsDorking` to return `{ email: string; sourceUrl: string; context?: string }[]`.
     - In Phase 1 search scraping and Phase 2 page crawling, invoke `extractEmailContext` for every matched email to store `context`.

   - **Step 3: Refactor `src/server/modules/email.ts`**
     - In `huntEmails`, replace `context: page.text.slice(0, 160)` with `context: extractEmailContext(page.text, email)`.

   - **Step 4: Update `src/server/scanner.ts`**
     - When appending dorked emails:
       ```ts
       for (const ext of dorkedEmails) {
         if (!emails.find(e => e.email === ext.email)) {
           emails.push({
             email: ext.email,
             sourceUrl: ext.sourceUrl,
             sourceType: "html",
             context: ext.context,
             role: roleFor(ext.email),
             validity: dnsResult.mx.length ? "valid-mx" : "unknown"
           });
         }
       }
       ```

   - **Step 5: Update `src/client/main.tsx`**
     - In Email Hunter section:
       ```tsx
       <DataTable rows={result.emails.map((email) => ({
         email: email.email,
         role: email.role,
         validity: email.validity,
         source: (email.sourceType === "html" && email.sourceUrl.startsWith("http")) ? <a href={email.sourceUrl} target="_blank" rel="noreferrer" className="text-cyanx hover:underline">Link</a> : email.sourceUrl,
         context: email.context || "N/A"
       }))} />
       ```

---

## 3. Caveats

- **Search Engine Blocking / Captchas**: Search engines (Google, Yahoo, Bing, DuckDuckGo) may rate-limit or return CAPTCHAs during rapid automated scans. Phase 2 (crawling actual result URLs) acts as a reliable fallback for extracting contextual snippets directly from target/third-party HTML pages.
- **Obfuscated Email Extraction**: Obfuscated emails (e.g. `user [at] domain.com`) are converted to standard `@` notation; context extraction must match against the original or converted text positions.

---

## 4. Conclusion

Requirement R1 requires targeted enhancements across 4 files (`src/server/modules/search.ts`, `src/server/modules/email.ts`, `src/server/scanner.ts`, `src/client/main.tsx`) plus an `extractEmailContext` utility helper. The data contract in `src/shared/types.ts` already supports `context?: string`. Once these changes are made, email dorking and scanning will extract rich, window-centered text snippets and display them under a dedicated `context` column in the UI table.

---

## 5. Verification Method

1. **Unit & Type Check**:
   - `npm run server:build` (verifies TypeScript compilation with `tsconfig.server.json`).
   - `npm run test` (runs Vitest test suite).

2. **Isolation Test Verification**:
   - Run `npx vitest run scratch/test-hunter.test.ts` (with `BypassSandbox: true` for live network calls).
   - Verify that output objects in `dorkResults` contain non-empty `context` fields with surrounding text snippets for found emails (e.g., `cabinet@edu.gov.ro`).

3. **Frontend UI Verification**:
   - Run scan on `edu.gov.ro` via full scanner/UI and check Email Hunter section to confirm the `context` column displays contextual text snippets rather than generic/blank output.
