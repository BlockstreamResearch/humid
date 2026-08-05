# User Feedback Presentation Patterns

Adapt these examples to the repository's existing primitives, localization, and
error contracts. The names are illustrative.

## Contents

- [Pure Feedback Mapping](#pure-feedback-mapping)
- [Mutation Feedback Without Duplicate Reporting](#mutation-feedback-without-duplicate-reporting)
- [Inline Query Failure](#inline-query-failure)
- [Server Field Error](#server-field-error)
- [Blocking And Root Failures](#blocking-and-root-failures)

## Pure Feedback Mapping

Map a known outcome without causing side effects:

```ts
type Feedback =
  | {
      kind: "error"
      message: string
    }
  | {
      kind: "warning"
      message: string
      action?: {
        label: string
        href: string
      }
    }

function getSaveFeedback(error: unknown): Feedback {
  if (isApprovalRequired(error)) {
    return {
      kind: "warning",
      message: translate("Your change was submitted for approval."),
      action: {
        label: translate("View request"),
        href: `/requests/${error.requestId}`,
      },
    }
  }

  return {
    kind: "error",
    message: translate("Unable to save your changes."),
  }
}
```

The renderer or feedback facade decides how to display the returned structure.
The mapper does not report the error or navigate.

## Mutation Feedback Without Duplicate Reporting

When the Query mutation cache already owns technical reporting:

```ts
try {
  await updateProject.mutateAsync({
    projectId,
    name,
  })

  closeDialog()
} catch (error) {
  const feedback = getSaveFeedback(error)
  showFeedback(feedback)
}
```

There is no success toast because closing the dialog and updating the project
already make completion visible.

When no central reporter observes this imperative operation:

```ts
try {
  await exportReport(reportId)
  showSuccess(translate("Report exported."))
} catch (error) {
  reportError(error, {
    module: "report-export",
    context: { reportId },
  })

  showError({
    message: translate("Unable to export the report."),
  })
}
```

## Inline Query Failure

Keep a local failure inside the region it invalidates:

```tsx
const content = (() => {
  if (query.isPending) {
    return <UiSkeleton />
  }

  if (query.isError && query.data === undefined) {
    return (
      <UiAlert variant="error">
        <UiAlertTitle>{translate("Projects could not be loaded.")}</UiAlertTitle>
        <UiAlertAction onClick={() => void query.refetch()}>
          {translate("Try again")}
        </UiAlertAction>
      </UiAlert>
    )
  }

  if (query.data.length === 0) {
    return <ProjectsEmptyState />
  }

  return <ProjectsList projects={query.data} />
})()
```

A background refetch failure with existing `query.data` should normally keep
the list visible. Add a subtle stale or retry indication only when it helps the
user.

## Server Field Error

Attach a known field failure to the field and stop:

```ts
catch (error) {
  if (isNameTakenError(error)) {
    setError("name", {
      message: translate("This name is already in use."),
    })
    return
  }

  showError({
    message: translate("Unable to save the project."),
  })
}
```

Do not also show a general toast after setting the field error.

## Blocking And Root Failures

Use a dialog or native alert when the user must acknowledge a consequence or
choose an action before continuing.

Use a route, subtree, or application fallback when rendering or initialization
cannot continue. Keep the fallback stable and offer the narrowest valid
recovery action:

```tsx
function InitializationFallback() {
  return (
    <UiResult>
      <UiResultTitle>{translate("The application could not start.")}</UiResultTitle>
      <UiResultDescription>
        {translate("Restart the application and try again.")}
      </UiResultDescription>
      <UiButton onClick={restartApplication}>
        {translate("Restart")}
      </UiButton>
    </UiResult>
  )
}
```

Do not accompany the fallback with a duplicate toast.
