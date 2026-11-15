# Sidebar and master dropdowns

- Keep the established dark sidebar shell, branded active indicator, and
  explicit padding structure.
- Use the shared sidebar and navigation components instead of parallel local
  implementations when available.
- Use 0.875rem medium text for top-level navigation items and 0.8125rem normal
  text for sub-modules.
- Keep expandable module groups consistent: clear parent/child hierarchy,
  predictable expand/collapse behavior, visible active state, and accessible
  controls.
- Preserve the current default expanded/collapsed behavior unless the request
  explicitly changes it. If a request asks for a particular default, apply it
  consistently and make the state keyboard-accessible.
- Do not redesign the global or organization shell for module-specific work
  unless explicitly requested.
