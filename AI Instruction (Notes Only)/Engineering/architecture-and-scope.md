# Architecture and scope

- Treat the application as a multi-tenant, organization-scoped fashion and
  manufacturing ERP.
- Route module-specific work into the existing organization-level Master
  Module where appropriate.
- Keep business logic in domain services under `lib/services/<domain>/`;
  route handlers should focus on HTTP concerns.
- Reuse existing registries and shared components, including the ERP module
  registry, master-data registry, organization-context helpers, permission
  services, reports, and UI primitives.
- Do not rename, flatten, or relocate existing business modules without
  explicit approval. For a structural rename, list current and proposed paths
  and wait for confirmation.
- Treat the home page, global layout, navigation, theme, and shared styling as
  protected surfaces unless the request explicitly includes them.
