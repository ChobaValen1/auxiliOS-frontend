# Eficiencia operativa · v569

## Operational percentage hotfix (supersedes strict all-or-nothing display)

Observed October data: 3 open journeys caused the RPC period odometer to be null,
and historical unlinked remitos separately blocked every whole-period ratio.
UI now derives BOTH displayed km totals and percentage from the same dates having
closed valid odometer and valid billing km. Excluded dates contribute to NEITHER
total. Unlinked remitos are not invented or counted as billed: their presence labels
the observed relationship "Parcial · Servicios registrados", with visible detail.
Closed-date coverage is shown as n/N when dates were excluded. No open/invalid
journey is assumed zero, no empty denominator is divided, no company-filtered km
is divided by whole-fleet odometer. If no comparable date exists, percentage stays —.
Daily/cumulative scrub and summary use identical date masks. Cumulative means sum
of known closed dates, explicitly labeled; missing dates remain gaps, later valid
dates can resume the partial sum. Strict legacy ratio remains for verified prior-
period comparisons only. No DB writes, schema, payroll or service changes.
Independent live SQL aggregate: Oct 1–23 observed billing km 19,970.4 / odometer
35,032 = 57.0%, partial because historical remitos are not linked. This is validation
evidence, NOT hardcoded UI data. Builds and tests use the existing response contract.

Compact revision: side-by-side with revenue evolution above 900px, stacked below;
196px plot on wide containers / 180px on narrow. Third summary metric now explicitly
shows facturados / recorridos as a percentage (not capped at 100%). Idle = full-period
ratio; scrubbing = same selected day or cumulative-to-date as the two km values.
Missing/filtered/unlinked evidence still suppresses the calculation, rendering —%
and a visible non-comparable-data explanation rather than a fabricated 0%.
No database changes. React continues owning a single lazy island and SVG; spring,
touch, keyboard, reduced-motion and data-gap geometry remain unchanged.

## Image-led interaction revision

Approved by user: videoframe_8181.png, then explicit authorization to make an original
implementation based on the image, without 60fps access or source. This revision is NOT
the 60fps snippet and does not claim its exact springs/timing. Two prominent km values,
shared cursor, two local glows on the curves; minimal axes and bottom mode switch.
Default is now DAILY (supersedes cumulative default below). Idle/release/cancel restores
full-period totals. Hover, horizontal touch drag or keyboard selects a common observed
date; both values above update to that day or cumulative-to-day, labeled explicitly.
The secondary ratio always labels its full-period scope. Curve geometry uses bounded
smoothstep segments (no overshoot, no gaps bridged). Glow and cursor share one spring
index, stiffness 420, damping 38, mass .5, and the exact curve-coordinate evaluator.
Reveal is .8s, cubic-bezier(.22,1,.36,1), not a perpetual animation. Reduced motion
uses immediate positioning/reveal. No new packages, database or authorization changes.
Quality details collapse into a visible "Datos incompletos" affordance; full detail is
also present in the accessible daily table. Selection and mode are ephemeral, filters
remain owned by the dashboard. QA covers 320/390/1440, real touch events and pointer
capture, restoration on release, keyboard, dialog, missing values, error, themes,
reduced motion, ordinary spring cursor/glow alignment, and bounded geometry unit tests.

## Original data integration (unchanged)

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
