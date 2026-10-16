# SOCLE simulation consistency implementation plan

> Execute directly with the executing-plans workflow; use the captured live evidence as the specification.

**Goal:** Keep every simulation independent while making its pages consistently usable on desktop and phone.

**Architecture:** Preserve the existing organizations, roles, snapshots and business records. Fix frontend compatibility and preference handling; do not merge simulations or replace their contents.

**Tech stack:** Vanilla JavaScript/CSS, Node production runtime, SQLite, Edge/Playwright.

**Evidence:** Current Railway inventory, database backup and 48 screenshots from 16 October 2026, saved outside the repository under the chat's work/private and outputs/audit-socle directories.

## Constraints

- Preserve all five organizations and all business records.
- Use SW3 for the team/project/planning/time-entry reference, supplemented by the terrain workspace's documents.
- Keep authenticated access and tenant checks authoritative on the server.
- A missing density preference means standard size; another organization's setting must not leak into it.
- Missing optional training arrays in old records must not prevent Mon espace from rendering.
- Production startup script must be included exactly once.
- Duplicate organization names must remain separate and become distinguishable in the switcher.
- Do not claim physical-phone or Safari verification from Chromium emulation.

## Tasks

1. **Prepare isolated verification.** Restore the live backup to a local database, provision a local-only credential with a new local secret, and run the production runtime behind local HTTPS. Do not modify the live business database.
2. **Reproduce and fix startup duplication.** Add an assertion to the production HTTP test proving that one runtime script is returned. Observe failure, avoid duplicate injection, rerun the test.
3. **Reproduce and fix display preference isolation.** Prove terrain-wide -> SW3-standard fails on the baseline. Stop using the unscoped browser cache as an authenticated workspace's default. Preserve an explicit saved wide preference.
4. **Reproduce and fix old-record compatibility.** Open Mon espace on the SW3 backup and capture the failure. Normalize absent optional collections without replacing recorded values. Verify the real page on desktop and mobile and rerun person-scope tests.
5. **Disambiguate duplicate simulations.** Present creation date/time only for duplicate names, consistently in the active label, menu and fallback selector. Test distinct labels, correct target IDs and unchanged access controls.
6. **Responsive corrections.** Preserve the deployed mobile header fix absent from the recovered copy. Inspect permissions and other scrollable panels at standard/wide size; correct only reproduced clipping, and retain intentional scrolling.
7. **Verify and publish reviewable changes.** Build; run targeted and complete hermetic checks; repeat browser navigation on both sizes and compare organization data against the backup. Publish the source changes to GitHub. Prepare a concrete deployment result for approval if deployment authorization is still needed.

## Review focus

- A preference failure or null value must not inherit another tenant's display size.
- Old data must retain every existing person, project, assignment and time entry.
- A company switch must target its exact ID even if two names are identical.
- Desktop sidebar and mobile dock must expose the same permitted modules.
- Screenshots must identify the actual page, not the previous page left behind by a JavaScript exception.

## Progress

- Live inventory, credential repair, backup and initial 48 captures completed.
- Confirmed causes: inherited density cache, missing optional training array, duplicate production runtime injection.
- Permissions and partner rows have horizontal scrollers; distinguish intended scrolling from clipping before editing.
