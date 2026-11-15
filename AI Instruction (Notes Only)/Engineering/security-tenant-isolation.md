# Security and tenant isolation

- Authenticate every server page, server action, and API route using the
  appropriate user or platform session.
- For organization routes, verify both the authenticated user and route
  organization with the established organization-context or equivalent
  membership check. Verify workspace route parameters match the authenticated
  workspace.
- Use the authorized internal organization primary key for organization-owned
  records. A public route ID is not authorization.
- Include the authorized organization ID in every tenant-owned read, update,
  delete, aggregate, and relation lookup. Never load by record ID alone and
  authorize afterward.
- Enforce the narrowest relevant permission in the service layer, not only in
  navigation or page layouts. Separate view, create, edit, delete, submit, and
  approve permissions when applicable.
- Keep platform administration and organization administration as separate
  trust boundaries.
- Keep development user stores and default credentials unavailable in
  production. Never log secrets, tokens, invitation URLs, personal data, or
  full request bodies.
- Treat `.env` and deployment settings as protected, read-only configuration.
  Do not expose or modify secrets or database connection settings without
  explicit authorization.
