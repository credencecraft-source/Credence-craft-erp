# Security and protected configuration difference

**Active rule —** `.github/copilot-instructions.md` makes `.env`, `.env.*`,
deployment settings, and named database connection settings read-only. It
requires redacted metadata for diagnosis, approval before any protected
setting change, and prohibits destructive/data-writing production
troubleshooting. It also names the protected connection variables.

**Notes rule —** The security note summarizes environment/database protection
and says not to expose or modify protected settings without explicit
authorization.

**Difference —** The notes omit the complete list of protected connection
variables and detailed diagnostic/production-operation restrictions. The
active file is more specific.
