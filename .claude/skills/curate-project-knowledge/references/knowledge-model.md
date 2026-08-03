# Knowledge model

## Surfaces and trust

- `raw/`: append-oriented untrusted input; never evidence.
- `intake/`: Git-frozen raw review records; never current truth or an OKF source.
- `reconstruction/`: source-first baseline and audit receipts at exact revisions.
- `changes/active/`: proposed behavior, living execution agreements, and their checkpoints.
- `changes/archive/`: qualified historical changes and resolved capture receipts.
- `changes/inbox/`: pending non-authoritative captures awaiting triage.
- `knowledge/`: curated OKF v0.2 current knowledge and the default reading surface.
- source repositories: implementation authority at exact revisions.

QMD retrieves Markdown but never proves truth or coverage. Compiled graphs are
disposable navigation. Graphify navigates source code but is not authority.
Every selected source is read directly.

All lanes converge through one promotion gate: extract atomic candidates,
verify each against its proper authority, obtain maintainer adjudication for
normative or ambiguous meaning, update the smallest coherent current concepts,
verify quality, and validate the bundle.

## One truth, multiple views

Product and engineering documents are linked views of the same project, not
independent truths.

### Product view

Use for vision, Areas, capabilities, use cases, cross-Area product flows,
domain concepts, product rules, delivery summaries, and stakeholder evolution.
It answers what the product provides, who it serves, how it behaves now, which
rules and exceptions apply, and whether it is available.

Declare:

```yaml
view: product
purpose: current-behavior
audience: [stakeholder, maintainer, domain-expert]
```

Product bodies contain no implementation detail. Their `Engineering details`
section contains links only.

### Engineering view

Use for implementation, architecture, repositories, contracts, data and
control flow, runtime behavior, operations, and technical constraints. It
answers how current product behavior is realized and verified.

Declare:

```yaml
view: engineering
purpose: technical-realization
audience: [engineer, operator, maintainer]
```

Engineering documents link product meaning and never infer accepted intent
from code.

### Decision, reference, and uncertainty views

- Decisions use `view: decision`, `purpose: decision-history`, and include the
  maintainer audience.
- Primary external context uses `view: reference`,
  `purpose: external-context`.
- Trusted live questions use `view: uncertainty`, `purpose: open-question`.

Proposed or rejected ideas do not use a current knowledge view.

Create a standalone decision only when the choice is hard to reverse,
surprising without context, or resolves a real tradeoff. Keep routine local
choices in the owning concept, change ledger, or Area evolution. A repeated
rejection may expose a durable non-goal, but only an explicit maintainer
decision promotes that negative rule; rejected proposals remain case-only.

## Human information architecture

- `knowledge/index.md`: progressive project entry point.
- `vision/`: accepted project purpose, outcomes, principles, and non-goals.
- `areas/`: primary durable product or functional decomposition.
- `product/`: concise users, outcomes, Areas, and genuinely cross-Area flows.
- `architecture/`: cross-Area technical realization.
- `decisions/`: only genuinely cross-Area decision records.
- `repositories/`: technical ownership and integration boundaries.
- `uncertainties/`: trusted unresolved current questions.
- `references/`: primary external context.

Each `areas/<area>/index.md` is the main stakeholder page. It links typed
sibling collections:

```text
areas/<area>/
├── index.md
├── capabilities/     # product
├── use-cases/        # product
├── concepts/         # product/domain
├── rules/            # product
├── implementation/   # engineering
├── decisions/        # decision history
└── log.md             # local chronology
```

Do not nest implementation and decisions under a capability merely because
they support it. Link them. Subdivide a typed collection only when its own
size requires it.

Use root collections only for honest project-wide ownership. When one Area is
primary, store the artifact there and link it from affected Areas. A bounded
context is a proven technical model and language boundary, not another word
for Area.

## Product intent and realization

Document lifecycle and product delivery are independent:

```yaml
realization:
  intent: accepted
  delivery: verified
  alignment: aligned
  assessed_at: 2026-07-28T12:00:00Z
```

- Curated intent is `accepted` or `superseded`.
- Delivery is `absent`, `partial`, `implemented`, `verified`, `retired`,
  `unknown`, or `not-applicable`.
- Alignment is `aligned`, `drifted`, `unknown`, or `not-applicable`.

Concrete delivery requires implementation authority. Concrete alignment
requires both product and implementation authority. Code proves observed
delivery, never accepted intent or correctness.

## Authored relations and compiled navigation

Every concept declares `x-wf.relations`. Add only material relations, give
each a meaningful context, and repeat its target as a normal Markdown link.
Supported kinds are `supports`, `governed-by`, `implemented-by`, `depends-on`,
`affects`, `conflicts-with`, and `related-to`.

Area ownership and decision lineage have dedicated metadata and generated
edges. Stable concepts remain reachable from `knowledge/index.md`.
`wfctl knowledge build` compiles these explicit statements into ignored
navigation artifacts; it infers no truth.

## Strict profile over OKF

Every concept requires:

- explicit lifecycle, view, purpose, audience, generation, and authority;
- non-empty claim-level authoritative sources with matching footnotes;
- explicit authored relations and valid human-visible links;
- current verification for stable content;
- a current semantic quality receipt for stable content;
- human verification for normative authority;
- explicit deprecation destination or reason;
- no raw or intake reference.

Path and view must agree:

- product: `vision/`, `product/`, and Area `capabilities/`, `use-cases/`,
  `concepts/`, or `rules/`;
- engineering: `architecture/`, `repositories/`, and Area `implementation/`;
- decision: root or Area `decisions/`;
- reference: `references/`;
- uncertainty: `uncertainties/`.

The validator rejects code and implementation sections in product documents
and requires their stakeholder sections. It requires technical sections in
engineering documents. Deterministic checks cannot prove semantic truth, so
`verify-knowledge-quality` reads the full evidence and records a
content-hash-bound review.

## Quality receipt

After semantic review, record:

```yaml
x-wf:
  relations: []
  quality:
    status: passed
    by: workflow-agent/1
    at: 2026-07-28T12:00:00Z
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
        by: workflow-agent/1
        at: 2026-07-28T12:00:00Z
        content_hash: "<same hash>"
      reader-communication:
        status: passed
        by: workflow-agent/1
        at: 2026-07-28T12:00:00Z
        content_hash: "<same hash>"
```

The material hash excludes `verified` and `x-wf.quality`, allowing both
receipts to bind the exact authored content without self-reference. Any other
material edit changes the hash and invalidates both receipts. The quality
receipt records a review; it creates no authority. Its two axes review
authority/truth and reader communication independently.

## Authority by claim

- Intent, product meaning, architecture rationale, ownership, contracts,
  policy, and decisions require maintainer authority.
- Existing implementation requires pinned source code.
- Absent delivery may use a reviewed whole-scope reconstruction receipt.
- History requires pinned version-control evidence plus a reviewed archived
  change or reconstruction receipt.
- External facts require primary sources.

Pinned code resources use
`git:<repository>@<40-character-commit>#<path>[:<symbol>]`.
Reviewed changes use `project-change:<id>#<section>`.
Reviewed reconstruction decisions use
`project-reconstruction:<case-id>#<candidate-id>`.

Authority is claim-specific. Repetition, recency, search rank, and agent
confidence do not create authority.

## Current truth and evolution

Keep current meaning at one stable path. A changed decision creates a successor
record and deprecates predecessors through reciprocal lineage. Do not version
whole Areas.

The product Area index leads with current behavior. Its Evolution section
summarizes what changed, why, and what it affected. Full decision records keep
context, exact choice, rationale, alternatives, consequences, transition, open
questions, and lineage. Area logs provide local chronology without flattening
hundreds of decisions into one file.

Canonical domain language belongs with the owning Area concept rather than a
flattened global glossary. Record the preferred term, definition, contextual
boundary, accepted aliases, and names to avoid. Proposed terminology stays in
the active change record until product authority accepts it.
