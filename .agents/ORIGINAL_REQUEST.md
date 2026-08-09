# Original User Request

## Initial Request — 2026-08-09T03:27:28+03:00

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Execution delegated to teamwork_preview

Re-architect the email dorking and hunting mechanisms to display rich contextual information and sources. Additionally, fix the subleased infrastructure logic regression to correctly identify infra owners, and update the frontend UI so 'active-discovery' mode visually forces all toggles to be checked.

Working directory: /Users/davidalexandru/Downloads/domain_check
Integrity mode: development

## Requirements

### R1. Enhanced Email Hunter
Improve the email dorking logic (`search.ts` / `email.ts`) and frontend to capture and display more detailed source information and contextual snippets for each discovered email.

### R2. Subleased Infrastructure Fix
Debug and fix the regression in the infrastructure trace logic (`infrastructure.ts`) so that it correctly infers and displays who is most likely to own the actual infrastructure where the target is hosted.

### R3. Active Discovery UI Force
Update the frontend React components (`main.tsx`) so that selecting "active-discovery" mode automatically checks and visually locks all advanced scanning toggles.

## Verification Resources
You can use the existing `scratch/test-hunter.ts` and `scratch/debug-search.ts` scripts in the workspace to test the email dorking module in isolation before running the full server.

## Acceptance Criteria

### Verification
- [ ] Running a scan against `edu.gov.ro` via the UI displays specific source context/snippets for emails rather than generic output.
- [ ] The subleased infrastructure section for `edu.gov.ro` successfully identifies an organizational owner (e.g., ICI or similar) rather than failing or showing 'unknown'.
- [ ] In the UI, selecting "active-discovery" immediately checks all active control toggles.
- [ ] No regression in the server build process (`npm run server:build`).
