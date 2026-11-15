# Platform administration workflow

## Purpose and scope

Platform administration is a separate trust boundary from organization
administration. The platform area includes organizations, subscriptions,
workspace users, leads, support, settings, and platform account access, subject
to role and view restrictions in the current application.

## Typical business flow

1. Authenticate a platform session and resolve the actual platform account and
   effective view.
2. Authorize each action against the platform role/team role at the service
   boundary.
3. Validate the target platform record and allowed lifecycle transition.
4. Execute the action transactionally where multiple records are affected.
5. Record a platform audit event and return only the information needed by the
   interface.

## Rules and restrictions

- Never substitute a platform lookup or public organization ID for
  organization membership authorization.
- Treat actual role and selected view separately; UI view switching does not
  grant permissions.
- Recheck access in server actions, pages, APIs, and services as appropriate.
- Restrict lead, organization, subscription, support, and account operations
  according to the currently implemented role policy. Do not copy assumptions
  from this note into authorization code.
- Avoid exposing sensitive user, invitation, or support data unnecessarily.
- Audit platform mutations with actor, action, entity, timestamp, and safe
  details.

## Conditions to verify

Actual role versus effective view, team-role scope, access to leads, platform
account management, organization actions, subscription approvals, support
ticket access, and audit requirements. Confirm all of these in the session
manager, permission/service functions, route/page guards, and tests.
