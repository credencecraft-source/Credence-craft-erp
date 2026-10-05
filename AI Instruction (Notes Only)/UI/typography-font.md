# Typography and fonts

These are the requested UI hierarchy targets. Prefer the shared design system
and token-backed components over page-specific font classes.

| Element | Target size | Weight |
| --- | --- | --- |
| Page title | 1.5rem | Bold |
| Top header title | 1.25rem | Semibold |
| Module or card title | 1.125rem | Semibold |
| Sidebar navigation item | 0.875rem | Medium |
| Sidebar sub-module | 0.8125rem | Normal |

- Do not introduce arbitrary text sizes such as ad hoc `text-xl` or `text-2xl`
  when they do not match the defined scale.
- Avoid arbitrary font weights; use the hierarchy above and existing component
  styles.
- Preserve established typography elsewhere unless the requested change
  specifically covers it.
