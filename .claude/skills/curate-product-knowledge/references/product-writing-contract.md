# Product writing contract

## Reader contract

Write for a product manager, client, maintainer, or domain expert who wants to
understand what the product does without learning how the software is built.
The reader should be able to answer:

1. What does this provide and why does it matter?
2. Who uses or depends on it?
3. Which domain terms does it own, and what do they mean here?
4. What happens now in observable product terms?
5. Which rules, outcomes, boundaries, and exceptions apply?
6. Is it available, partial, absent, retired, or uncertain?
7. What changed materially and where can the rationale be found?

This is neither end-user help nor a PRD. It is the stakeholder view of current,
verified product knowledge. Proposed behavior stays in active change records.

## Language rules

- Lead with the current answer.
- Prefer short concrete sentences and active voice.
- Use domain language; define necessary terms on first use.
- Reuse canonical Area terminology. Record aliases and discourage overloaded
  names rather than silently switching vocabulary.
- Describe outcomes, choices, state changes, and visible consequences.
- Preserve conditions, exceptions, and non-goals.
- Replace internal identifiers with human names.
- Do not include code fences, inline code, API routes, source paths, data
  schemas, class or function names, storage mechanisms, package names, or
  protocol details.
- Do not say "the system" when the specific product actor or capability is
  known.
- Do not call planned behavior current. Pair every present-tense delivery claim
  with evidence and an explicit realization state.

## Required sections

- `What this provides`
- `Who it serves`
- `Domain language`
- `Current behavior`
- `Rules and outcomes`
- `Boundaries and exceptions`
- `Delivery`
- `Examples`
- `Evolution`
- `Related knowledge`
- `Engineering details`

Use `Not applicable` with a short reason rather than deleting a section whose
absence could hide an unexamined concern. `Engineering details` contains links
only; it never summarizes implementation.

## Abstraction test

Fail the product view when any of these are true:

- a stakeholder needs engineering knowledge to understand the main answer;
- replacing an implementation would require rewriting product behavior even
  though the behavior did not change;
- technical nouns outnumber product or domain nouns;
- an important exception disappeared during simplification;
- the text implies delivery that the realization state or evidence does not
  support;
- history overwhelms the current answer;
- a raw candidate or agent inference appears as authority.

## Method basis

The contract combines established boundaries rather than inventing one prose
style:

- Diátaxis separates documentation by reader need:
  https://diataxis.fr/
- Spec Kit keeps product specification focused on what and why, with technical
  how in a separate plan:
  https://github.github.com/spec-kit/reference/agentic-sdd.html
- GOV.UK Content Design starts from user need and plain language:
  https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/plan-manage-content/understand-content-design/
- W3C clear-content guidance requires understandable language and structure:
  https://www.w3.org/WAI/WCAG2/supplemental/objectives/o3-clear-content/
- Cucumber BDD uses concrete examples to align business and technical meaning:
  https://cucumber.io/docs/bdd/
- Domain Storytelling validates domain behavior with domain experts:
  https://domainstorytelling.org/
