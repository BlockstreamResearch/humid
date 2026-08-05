---
name: forms
description: Use whenever work creates, changes, reviews, or debugs a form, form field, input flow, validation schema, submit flow, create or edit form, server field error, react-hook-form register or Controller integration, or Zod form schema. Trigger even when the request only describes a product form such as sign-in, settings, search, filters, a dialog form, or an editable resource without naming the form libraries.
---

# Forms

Build forms with `react-hook-form` + Zod and treat each form as a thin,
declarative boundary around rendered fields and submission.

A field control may be:

- an existing `Ui*` design primitive;
- a composition of several primitives;
- a product component with its own meaningful controlled or uncontrolled API.

Inspect the repository's existing UI and product components before creating a
new control. Follow **components** for primitive reuse, product-component
ownership, and controlled/uncontrolled component contracts.

## Schema and Types

- Define the Zod schema close to the form unless the same form contract is
  genuinely shared. Colocation beats premature extraction.
- The form schema mirrors the fields represented by the rendered form. It is
  the readable inventory, validation contract, and value contract for that UI.
- Type form values with `z.infer<typeof formSchema>`. Never hand-maintain a
  parallel `FormValues` interface.
- Wire validation through `zodResolver(formSchema)`.
- A form schema is not an API DTO and must not be shaped around one. Do not
  create API types, proxy types, or DTO schemas inside the form.
- Give every stable field an explicit initial value through `defaultValues`.
  Never use `undefined` as the value of a controlled field or `Controller`.
- Treat browser-managed file inputs separately. For conditionally mounted or
  dynamically registered fields, deliberately choose registration,
  unregistration, and default-value behavior instead of relying on omission.

## Create And Edit Forms

One form component may support both creation and editing by accepting an
optional existing entity:

- entity present → edit mode;
- entity absent → create mode.

Absence must mean create mode only. The owner must resolve loading, error, and
not-found states before mounting an edit form; do not temporarily render create
mode while an entity is still loading.

Populate `defaultValues` explicitly from the entity:

```ts
const form = useForm<FormValues>({
  resolver: zodResolver(formSchema),
  defaultValues: {
    name: entity?.name ?? "",
    description: entity?.description ?? "",
  },
});
```

Select only fields represented by the form. Do not spread the entire entity
into `defaultValues`.

Treat these defaults as the initial snapshot for that form instance. When the
owner switches to a different entity, remount the form by identity:

```tsx
<EntityForm key={entity?.id ?? "create"} entity={entity} />
```

Key by stable identity, not by the entity object or all of its values. A
background query update for the same entity must not silently overwrite dirty
user input.

Create both mutation hooks unconditionally, as required by React's hook rules,
and choose the operation inside `handleSubmit`:

```ts
const onSubmit = handleSubmit(async (values) => {
  if (entity) {
    await updateMutation.mutateAsync({
      id: entity.id,
      name: values.name,
      description: values.description,
    });
    return;
  }

  await createMutation.mutateAsync({
    name: values.name,
    description: values.description,
  });
});
```

Do not use `useEffect` to copy entity data into form state. After a successful
update, call `reset()` with the committed form values only when the form remains
open and should establish a new pristine baseline. A form that closes or
navigates away does not need that reset.

## Numeric and Coerced Inputs

- HTML inputs usually produce strings. Decide explicitly what an empty value
  means before converting it.
- Use `z.coerce.number()` only when its empty-string and coercion behavior is
  correct for that field. Remember that `Number("")` is `0`.
- Prefer a deliberate `z.preprocess`, `register(..., { valueAsNumber: true })`,
  or `setValueAs` when empty, optional, and invalid values need different
  semantics.
- Apply the same discipline to dates, booleans, selects, and any other control
  whose rendered value differs from its form value.

## Validation

- Per-field rules live on the field schema with a user-facing message
  (`z.string().trim().min(1, "...")`).
- Cross-field rules use `.refine()` / `.superRefine()` and **must set `path`** so the
  error attaches to the right field (e.g. confirm-password mismatch -> `path: ["confirmPassword"]`).

## Submit and Pending State

- Prefer one `handleSubmit(async (values) => { ... })` as the complete
  form-submission flow. Keep request preparation, `mutateAsync`, field-error
  handling, and success UX readable in that handler.
- Call the typed mutation with an explicit object built directly from form
  values:

```ts
const onSubmit = handleSubmit(async (values) => {
  await mutation.mutateAsync({
    email: values.email,
    password: values.password,
  });
});
```

The mutation's typed parameter is the API contract and verifies the object.
Do not create form-to-DTO mappers, conversion helpers, proxy types, or local API
schemas. Form-only fields simply do not appear in the mutation call.

- Use `mutateAsync` so the submit handler can await the operation and express
  success and failure in normal control flow.
- `mutateAsync` rejects when the mutation function rejects, so an ordinary
  `try`/`catch` handles submit failures without `throwOnError`. That option
  controls render-phase propagation to an Error Boundary; do not enable it just
  to make form error handling work. If the mutation function resolves an error
  as a successful value or otherwise swallows it, correct or follow the
  established contract in **api-integration** rather than compensating inside
  the form.
- Compute one pending flag:
  `isPending = formState.isSubmitting || mutation.isPending`.
- Drive duplicate-submission prevention and the submit control's pending
  presentation from that flag.
- Keep canonical invalidation and API-wide mutation behavior inside the API
  module's `mutationOptions`. See **api-integration**.
- Prefer local success UX directly after the awaited mutation: show feedback,
  `reset()`, navigate, or close the form.
- Do not spread canonical mutation options and then overwrite their
  `onSuccess` or `onError` callbacks in the form.

## register vs Controller

- **`register()` by default.** Native-input `Ui*` wrappers (`UiInput`, `UiTextarea`)
  expose a native `value`/`onChange`/`ref` contract and bind directly: `{...register("email")}`.
- **`Controller` only when a component lacks a compatible native input
  contract.** Custom primitives such as selects, switches, checkboxes, radio
  groups, and segmented controls commonly need it.
- Product components may also act as fields. When their state must be owned by
  the form, compose `Controller` with the component's controlled API
  (`value`/`onValueChange` or its semantic equivalent). Do not move RHF into the
  product component merely to make it usable by a form.
- Compose react-hook-form's `<Controller>` directly with the existing primitive
  or product component at the field call site.
- Never create or reuse `ControlledUi{X}` components, `controlled.tsx` modules, or
  reusable wrappers around `useController`. Keep RHF ownership visible in the form and
  keep the `Ui*` layer independent of the form library.

## Field Composition

Prefer the established shadcn-style field composition when the project provides
it: a field container groups its label, control, optional description, and
validation error. The container owns field-level layout and invalid state; the
control keeps its own visual and interaction contract.

This is a recommendation, not a mandatory component tree. Inspect existing
forms and the repository's UI primitives before choosing exact components,
names, props, or ordering.

An adapted shadcn `Field` composition may look like:

```tsx
<UiField data-invalid={!!errors.email}>
  <UiFieldLabel htmlFor="email">Email</UiFieldLabel>
  <UiInput
    {...register("email")}
    id="email"
    type="email"
    autoComplete="email"
    aria-invalid={!!errors.email}
  />
  {errors.email?.message && (
    <UiFieldError errors={[errors.email]} />
  )}
</UiField>
```

The names are illustrative. Use the project's equivalent rather than creating
these wrappers solely to match the example. Never restyle a base control to make
it fit a form; compose around it.

## Server Field Errors

- Catch submit failures in the `handleSubmit` callback when the form needs to
  classify them.
- When the API returns a field-specific failure, attach it with
  `setError(field, { message })`, then return.
- Detect the specific failure from the typed transport error (status/code/detail), not by
  string-matching a generic message. Transport errors are thrown as received and preserve
  their status/message/detail (owned by **api-integration**) — exploit that here instead of
  flattening.
- General submit failures surface through the project's feedback flow, not
  `setError`.
- Use one presentation path for each failure. Do not show a general mutation
  error and then show the same failure again as a field error.

## Cross-References

- `Ui*` primitives, product fields, field-error presentation, and
  controlled/uncontrolled component APIs → **components**. RHF `Controller`
  composition remains owned here.
- `mutationOptions`, query/mutation key factories, and cache invalidation placement
  -> **api-integration** (separate skill from state management).
- Submit success and failure feedback (`showError` / `showSuccess` or the
  repository's equivalent) -> **user-feedback**.
- Submit failure propagation, reporting, retry, and Error Boundary policy ->
  **error-handling**.
- Page/feature placement of the form module and where its files live -> **file-structure**.

## Anti-Patterns

- No `useEffect` to sync derived form state — derive in render or via watched values.
- No restyling base UI components to make a field fit; wrap them.
- No ternary expressions for conditional JSX. Use a simple logical condition
  for one optional element and an ordered IIFE for multiple render branches.
- No form-to-DTO mapper layer, local API types, or duplicate API schemas.

See `references/patterns.md` for terse, stack-specific patterns that should be
adapted to the repository's existing components and contracts.
