# Git, commits, and push rules

- Do not commit or create branches unless the user requests it.
- Push only when explicitly requested, and only to a confirmed test branch and
  remote. Ask for the target if either is unclear.
- Never push directly to production, force-push, rewrite history, or include
  unrelated work in a push.
- Preserve unrelated and pre-existing user changes. Do not revert work that
  was not made for the current task.
- Use non-interactive Git commands.
- Never amend commits unless explicitly requested.
- When creating a commit, include this trailer unless the user explicitly
  asks not to:

  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
