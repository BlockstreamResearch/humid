---
name: verify-knowledge-quality
description: Perform the mandatory two-axis semantic gate for curated workflow knowledge before a document becomes stable or is reported complete. Use after creating or materially editing any product, engineering, decision, reference, or uncertainty concept, or for an explicit quality audit. Review authority and truth independently from reader communication, then bind both passes to one unchanged content hash. Do not use for ordinary explanation and do not let deterministic validation, polished prose, or a single self-review satisfy both axes.
---

# Verify Knowledge Quality

Act as an adversarial review coordinator, not the author defending the draft.
Truth and communication are different failure surfaces; neither may compensate
for the other.

Read [the quality rubric](references/quality-rubric.md) before the first review
in a session.

## Freeze the review target

1. Read the complete target document, not a snippet.
2. Read its parent Area index, every linked current product or engineering
   counterpart, every current decision that governs it, and every material
   authoritative source.
3. For code-backed claims, invoke `analyze-with-graphify` in the exact pinned
   leaf and directly inspect the cited source, tests, and necessary runtime
   evidence.
4. Run `wfctl knowledge validate --concept <path>` and distinguish structural
   failures from semantic failures. Structural success is necessary but never
   sufficient.
5. Run `wfctl knowledge hash --concept <path>` and pin the candidate content
   hash before semantic review.

## Run two independent axes

1. Apply [the authority and truth review](references/authority-review.md).
2. Separately apply
   [the reader communication review](references/reader-communication-review.md)
   for the declared view and audience.
3. Use independent reviewer contexts when the runtime safely provides them.
   Otherwise perform two explicitly separated passes from their own checklists
   and evidence packets. Do not reuse the first pass's verdict as evidence for
   the second.
4. Search across both passes for omitted exceptions, unsupported present
   tense, mixed audiences, hidden implementation detail, intent inferred from
   code, history presented as current, and claims broader than evidence.
5. Return one review packet with:
   - result: passed or failed;
   - separate authority-truth and reader-communication results;
   - each failed, uncertain, unread, or blocked check;
   - exact evidence and conflicting evidence;
   - the smallest correction;
   - authority needed from the maintainer, if any.
6. Recompute the content hash. If it changed, discard both passes and rerun
   them on the new revision.
7. Do not write a passed receipt while any item is failed, uncertain, unread,
   or blocked.

## Record a passed receipt

After all substantive content is final:

1. Run `wfctl knowledge hash --concept <path>`.
2. Set:

```yaml
x-wf:
  quality:
    status: passed
    by: "<producer>/<version>"
    at: "<ISO-8601>"
    content_hash: "<wfctl knowledge hash output>"
    checks:
      - factuality
      - audience-fit
      - abstraction
      - completeness
      - delivery-state
    axes:
      authority-truth:
        status: passed
        by: "<producer>/<version>"
        at: "<ISO-8601>"
        content_hash: "<same wfctl knowledge hash output>"
      reader-communication:
        status: passed
        by: "<producer>/<version>"
        at: "<ISO-8601>"
        content_hash: "<same wfctl knowledge hash output>"
```

3. Use the same hash in the normal `verified` event after the applicable
   machine or human authority review.
4. Re-run `wfctl knowledge validate --concept <path>`. A material edit changes
   the hash and invalidates both receipts.

The receipt proves that the declared review was performed against one exact
document revision. It does not create authority and does not make an incorrect
review true.
