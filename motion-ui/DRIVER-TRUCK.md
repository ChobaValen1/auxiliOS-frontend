# Driver truck · first implementation

React + Motion progressive enhancement of the existing driver-only truck page.
The legacy fleet view and existing fuel/control/maintenance/incident forms remain
canonical. Actions call the original functions rather than duplicate validation,
uploads, offline queues or business writes.

- Truck identity, plate, last recorded odometer, active journey.
- Independent direct-entry buttons and accessible history buttons.
- Compact identity card and header "+ Registrar" opens a native quick-action
  sheet: Registrar chequeo / Cargar combustible / Registrar mantenimiento.
  X, Escape and backdrop close it; focus returns before opening canonical forms.
- Explicit text/icon/color status chips. Green requires a complete good check or
  known healthy maintenance. Unknown/missing plans are not green; overdue plans
  dominate, and missing data cannot be masked by a different healthy plan.
- Most urgent maintenance plan uses canonical km/hour remaining and intervals.
  Missing readings are unavailable, never invented zero or a guessed percentage.
- Scoped responsive cards, press feedback, reduced-motion support.
- Native modal report history with focus return, Escape/X/backdrop close,
  Motion entrance and drag-handle downward dismissal.
- Reports are only this authenticated driver's current journey, max 50, with RLS.
  No test data is shipped. No schema or policy changes.
- No "in review", "resolved" or Operations replies: these fields/workflows do not
  exist in the current schema. The UI explicitly says so instead of faking a
  three-step timeline. This is the first stage for user review, not completion
  of that future workflow.

QA: test/driver-truck-ui.test.js; scripts/qa-driver-truck.cjs at
1440/768/390/320 px with canonical-shape fixtures and simulated action callbacks.
Real incident schema and driver-own RLS were inspected read-only. QA does not
submit real fuel, tyre, maintenance or incident records.
