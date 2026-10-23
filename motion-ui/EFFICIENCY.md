# Eficiencia operativa · v566

Scope: approved two-series mockup, Panel → Resumen only. No production promotion.
One lazy-loaded React 19 island, isolated from the existing global React 18 widgets.
React owns SVG, controls, focus, dialog and ephemeral selection. Pure TS owns geometry
and data transformation. No D3 dependency is needed for two linear scales and paths.
Motion 12 reveals a shared clip rectangle (preserves the dashed odometer line), once
in view and on mode/data changes; reduced-motion renders the final state immediately.
No continuous animation, drag, pinch, scroll interception, sensor permissions or CDN.
Build: npm --prefix motion-ui run build (Node 22.12+).

References supplied by user: ProjectHoursChart (Framer) for summary/comparison hierarchy;
PriceTargetFan for evolving series interaction; Hover morph-stepped-progress for moving
selection treatment. ProjectHoursChart source was inspected through its public asset
URL on 2026-10-23; it is a Framer-specific bar component, not a two-series time chart.
This implementation adapts those interaction/layout ideas; it does not claim to copy
paid components or ship Framer's runtime. Motion/React are existing pinned dependencies.

Semantic contract: solid amber billed km vs dashed blue-gray odometer km, one shared
zero-baseline km scale. Default cumulative; daily mode available. Missing daily values
break the line; cumulative stays unavailable after a gap. Ratios may exceed 100%.
No profitability, waste or dead-km inference. Billed means configured billing calculation
of completed own-fleet services, matching the existing dashboard formula, NOT issued
invoices. Excludes third-party and test services/trucks. Odometer uses valid final−initial
readings from closed journeys. Open/invalid journeys, missing service km, unlinked signed
remitos, zero denominator or company/base/concept filters suppress the ratio/delta.
Dates: service scheduled date vs journey start date, Buenos Aires. Future days excluded;
previous period has the same number of elapsed days, ending before selected start.
Completeness covers registered journeys only, not proof that every truck reported.

Mobile 320/390: primary ratio, two totals, 244px chart, fewer ticks; controls remain inline.
Tap and pointer select nearest date; keyboard arrows/Home/End select, Escape clears.
Always-visible last-date detail; native modal daily table provides screen-reader data,
Escape/close and focus return. No hover-only evidence. Error doesn't break other cards.
Verify data/permissions with PGlite; actual compiled bundle with browser fixtures at
320/390/1440, light/dark, reduced-motion, missing/error/filtered and >100% states.

Database security review: additive read-only RPC, fixed empty search_path, explicit
auth.uid and role guard (administracion/facturacion/supervision), anon/public revoked;
private core not executable by client roles. The Supabase advisor adds the generic
authenticated SECURITY DEFINER warning for this intentionally guarded API; no anon
warning was added. Reviewed against
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
and tested denied anonymous/driver plus allowed administration paths in PGlite.
Remote core query verified against live schema; browser session available was driver
only, so administrator end-to-end session validation remains a handoff limitation.
