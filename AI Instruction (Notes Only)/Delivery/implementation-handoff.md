# Implementation, review, and handoff

- Make precise, complete, surgical changes. Prefer the smallest change that
  fully addresses the request and avoid unrelated edits.
- Read enough local context before editing. Reuse existing helpers, shared
  components, naming, formatting, and localization patterns.
- Preserve type safety and existing behavior. Fix tightly coupled defects
  caused by the change, but do not repair unrelated pre-existing issues.
- Surface errors clearly; avoid broad catches, silent failures, and
  success-shaped fallbacks.
- Keep documentation aligned with directly related behavior.
- After focused validation, report the behavior changed, files touched,
  checks run and results, and practical manual review steps.
- Pause for user review before broad QA. Do not infer confirmation from
  silence.
- Do not claim completion or release readiness beyond what was verified.
