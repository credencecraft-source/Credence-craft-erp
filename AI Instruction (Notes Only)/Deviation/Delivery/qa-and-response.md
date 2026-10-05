# QA and response-format differences

## Difference 1: focused QA and confirmation

**Active rule —** Active delivery instructions require focused checks and
handoff first, explicit user confirmation before broad QA, and prohibit
`npm run qa` before that confirmation. They also require honest reporting of
unavailable checks and unresolved risks.

**Notes rule —** The QA note summarizes a focus-first sequence and confirmation
gate, while allowing some details to be less explicit.

**Difference —** The summary must not be read as relaxing the strict active
confirmation gate or reporting requirements.

## Difference 2: response format

**Active rule —** `.github/copilot-instructions.md` requires completed task
summaries to contain exactly two bullets, each no longer than 50 words.

**Notes rule —** The delivery notes do not currently state this exact
two-bullet/50-word format.

**Difference —** This output constraint is missing from the notes.
