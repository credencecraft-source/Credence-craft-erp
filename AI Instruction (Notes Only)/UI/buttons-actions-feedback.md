# Buttons, actions, and feedback

- Use the centralized button component and its supported semantic variants:
  Primary, Secondary, Outline, Ghost, and Destructive.
- Do not create raw or unstyled delete actions. Delete controls must use the
  destructive treatment, clearly communicate the consequence, and require
  confirmation where appropriate.
- Use shared modal and toast notification systems for feedback.
- Do not use native browser `alert()` or `confirm()` popups.
- Include loading and disabled states. Disabled controls must communicate that
  they cannot currently be used.
- Preserve keyboard operation, visible focus, and accessible names for
  icon-only actions.
