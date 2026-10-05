# Approvals workflow

## Purpose and registered submodules

The ERP registry lists Approval Master → Master Review and Purchase Order
Approval → Purchase Order Review. Other document types may have separate
approval paths; verify the registry and service code.

## Typical business flow

1. A creator prepares a document or master change and submits it for review.
2. The system checks that the record is valid, in a submittable state, and
   belongs to the authorized organization.
3. An eligible approver reviews the submitted version and approves, rejects,
   or requests correction using supported actions.
4. The system records the decision, actor, timestamp, and reason.
5. Approved changes become effective only through the corresponding domain
   transition; rejection returns the record to the defined correction path.

## Rules and restrictions

- Enforce legal state transitions server-side; navigation visibility is not
  authorization.
- Separate submitter and approver unless documented policy explicitly permits
  self-approval.
- Scope approval and target-record lookups to the organization.
- Prevent duplicate, stale, or repeated decisions using transactional state
  checks.
- Include the reviewed version/change in the approval context so material edits
  cannot silently invalidate an approval.
- Do not apply approval side effects without the corresponding service
  transaction and audit record.

## Conditions to verify

Configured approver chains, role/amount thresholds, delegation, rejection
reasons, resubmission behavior, stale-version handling, and whether each
document type has its own approval lifecycle.
