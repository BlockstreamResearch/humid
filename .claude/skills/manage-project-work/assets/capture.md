---
capture_version: 1
kind: capture
id: "{{CAPTURE_ID}}"
title: "{{TITLE}}"
status: pending
created_at: "{{CREATED_AT}}"
source: {}
claim_refs: []
resolution: null
---

# Summary

Record the reusable result, proposal, limitation, or observation. Separate
verified facts, maintainer intent, and inference.

# Evidence

Record exact source paths, revisions, commands, outputs, and known limits. For
intake or reconstruction material, retain fully qualified claim references in
`claim_refs`; never cite raw files as authority.

# Why retained

Explain why this material may affect a future product or engineering decision
despite not belonging to active work or curated knowledge yet.

# Suggested route

Recommend one next route: discard it, curate verified truth, or start/link a
normal significant change. The capture remains non-authoritative while it is
pending in `changes/inbox/`.
