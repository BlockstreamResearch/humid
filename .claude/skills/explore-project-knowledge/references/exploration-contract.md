# Product exploration contract

## Reader assumption

Assume the reader may know only that a project exists. They are not expected to
know its taxonomy, feature names, implementation, history, or the wording used
inside the knowledge base.

The agent owns discovery. The reader owns curiosity and product authority.

## Response levels

### Discovery

Answer:

1. What is this project for?
2. Who benefits from it?
3. What are its major product directions?
4. What works today?
5. What is partial, accepted but absent, retired, or unknown?
6. Where could the reader go next?

Keep the first response scannable. Prefer a short orientation plus three to
five meaningful branches over an exhaustive catalog.

### Area exploration

Answer:

1. What outcome does this direction own?
2. Who uses or depends on it?
3. Which major capabilities and flows belong to it?
4. Which rules and boundaries shape it?
5. What is its current delivery state?
6. Which questions or decisions remain open?

### Focused explanation

Lead with current behavior. Then explain rules, exceptions, delivery, examples,
and only the evolution necessary to understand the present.

## Conversation behavior

- A broad question receives a useful answer before any clarifying question.
- Suggested follow-ups use names and descriptions the reader has just seen.
- Each follow-up narrows one level unless the reader asks to compare multiple
  directions.
- Do not expose document paths, metadata, retrieval queries, or agent workflow
  in the normal answer.
- Do not offer an engineering deep dive as the only next step. Keep product
  exploration useful to nontechnical readers.
- Do not create knowledge while answering. A discovered gap becomes an
  explicit optional next action.
- Do not search proposals or active changes during ordinary current-product
  discovery. A roadmap question is a separate route and must remain labeled as
  future work.

## Failure conditions

Fail the exploration when it:

- asks the reader to name an Area or capability before showing what exists;
- starts with code, architecture, repositories, or file navigation;
- presents a flat inventory with no product hierarchy;
- hides delivery or uncertainty;
- treats planned or accepted-but-absent behavior as available;
- overwhelms the first answer with every rule and historical decision;
- modifies project state without a separate request;
- invents a complete project map from sparse or unverified knowledge.

## Evaluation discipline

Test discovery with natural prompts that do not reveal the expected taxonomy or
rubric. Keep assertions hidden from the tested agent. Test focused conformance
separately only after the exploration itself has surfaced a real Area or
capability name.
