# Issue design contract

An issue is an executable unit, not a copy of the parent spec.

## Good issue

- Delivers one complete behavior or resolves one explicit work prerequisite.
- Fits in one fresh agent session when possible.
- Names the acceptance IDs it contributes to.
- Declares only dependencies that genuinely prevent starting.
- Identifies repository scope without prescribing stale file paths.
- Can be verified independently at a public or project-approved seam.
- Leaves one precise, hash-bound checkpoint after every material turn.

## Bad splits

- one ticket per technical layer;
- one giant issue that silently relies on conversation memory;
- blockers used merely as ordering preferences;
- acceptance text duplicated and allowed to drift;
- source paths or snippets treated as permanent requirements;
- a local leaf checklist competing with the central bundle.

Prefactoring may be its own prerequisite issue when it makes the later behavior
safe and easy. It must still define an observable structural outcome and fresh
checks. Wide refactors use expand-migrate-contract rather than pretending each
layer is independently shippable.
