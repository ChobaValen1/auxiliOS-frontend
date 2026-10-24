# Tendencia · supplied chart adapters

Reference: user attachments BarRaceChart (React + Web Animations) and
ContributionSkyline (React + Canvas2D). Adapted to scoped AuxiliOS CSS, not a
global Tailwind/shadcn reset. No demo sellers, stock photos or random data.

## Layer briefs / local specialist passes

- Ranking: compare prestadoras by cumulative billing or completed services;
  daily company arrays from dashboard_tendencia_v1, all stable IDs retained.
  Top six visible; full accessible table available. Reference 600ms transition
  and cubic-bezier(0.22,1,0.36,1), 700ms playback steps; fixed scale across dates.
  Opens on final total, playback is opt-in and stops when hidden/offscreen.
- Calendar: find high/low-volume days in the same selected period and filters.
  Completed-service daily RPC series; not driver performance or an invented
  annual contribution history. Canvas retains source wave/camera projection,
  1300ms morph, cubic easing; HTML owns controls, summaries and daily table.
  Padding dates outside queried range are not drawn or selectable.
- React integration / Canvas / testing skills reviewed locally, no delegation.
  Two lazy chart instances, one Canvas, DPR capped at 2, event-driven animation;
  no permanent idle loop. Responsive one-column composition below 1150px,
  320px portrait minimum, native vertical scrolling, keyboard day selection,
  reduced-motion immediate states, explicit tables and readable labels.

## Data & ownership

No database migration or extra query. Existing Tendencia RPC and its completed
non-test service definitions remain canonical. Own metric controls do not change
the pre-existing trend lines. Existing comparison and stacked charts retained.
Requests use a generation guard; a newly selected period clears previous chart
values. Failed reads show an error rather than generated activity.

Build: npm run build from motion-ui. QA: test/dashboard-trends-interactive.test.js
and scripts/qa-dashboard-trends.js. Fixture data lives only in tests.
