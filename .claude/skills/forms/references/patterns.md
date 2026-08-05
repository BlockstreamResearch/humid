# Form Patterns

Stack-specific, adaptable skeletons for react-hook-form, Zod, TanStack Query,
and a shadcn-style component system. Replace component and feedback names with
the repository's established equivalents.

## (a) Basic Form + Mutation Submit with isPending

```tsx
const formSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  quantity: z.number().positive("Must be greater than 0"),
});
type FormValues = z.infer<typeof formSchema>;

function ResourceForm() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(formSchema),
      defaultValues: { title: "", quantity: 1 },
    });

  const mutation = useMutation(createResourceMutationOptions());
  const isPending = isSubmitting || mutation.isPending;

  const onSubmit = handleSubmit(async (values) => {
    // mutateAsync rejects when mutationFn rejects. throwOnError is only for
    // render-phase Error Boundary propagation and is not required here.
    try {
      await mutation.mutateAsync({
        title: values.title,
        quantity: values.quantity,
      });

      showSuccess("Saved");
      reset();
    } catch (error) {
      showError(error, { fallbackMessage: "Unable to save" });
    }
  });

  const submitLabel = (() => {
    if (isPending) return "Saving...";
    return "Save";
  })();

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <UiInput
        {...register("quantity", { valueAsNumber: true })}
        type="number"
        aria-invalid={!!errors.quantity}
      />
      <UiButton type="submit" disabled={isPending}>
        {submitLabel}
      </UiButton>
    </form>
  );
}
```

## (b) Cross-Field Refine (set path)

```ts
const schema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"], // attach error to the right field
  });
```

## (c) Build The Typed Mutation Parameter In handleSubmit

```ts
const onSubmit = handleSubmit(async (values) => {
  await signUpMutation.mutateAsync({
    email: values.email,
    password: values.password,
  });
});
```

`confirmPassword` remains part of `formSchema` because it is rendered in the
form, but it is simply not included in the typed mutation argument.

## (d) Server Field Error via setError

```ts
const onSubmit = handleSubmit(async (values) => {
  try {
    await mutation.mutateAsync({
      username: values.username,
      password: values.password,
    });
  } catch (error) {
    if (isFieldTakenError(error)) {            // detect from typed transport error
      setError("username", { message: "Username is already taken" });
      return;                                  // handled — do not rethrow
    }
    showError(error, { fallbackMessage: "Unable to save" });
  }
});
```

## (e) Controller Fallback (no native input contract)

```tsx
// Use for primitives or product fields that expose a controlled value contract.
<Controller
  control={control}
  name="enabled"
  render={({ field }) => (
    <UiSwitch checked={field.value} onCheckedChange={field.onChange} />
  )}
/>
```

## (f) Shared Create / Edit Form

Mount edit mode only after its entity is available. Remount when its identity
changes:

```tsx
<EntityForm key={entity.id} entity={entity} />
```

Use a distinct create-mode instance:

```tsx
<EntityForm key="create" />
```

Inside the shared form:

```tsx
function EntityForm({ entity }: { entity?: Entity }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: entity?.name ?? "",
      description: entity?.description ?? "",
    },
  });

  const createMutation = useCreateEntityMutation();
  const updateMutation = useUpdateEntityMutation();

  const onSubmit = form.handleSubmit(async (values) => {
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

  // Render the same form fields for both modes.
}
```

Do not synchronize later entity updates into the form with `useEffect`.
