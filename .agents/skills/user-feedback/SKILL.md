---
name: user-feedback
description: Use whenever work adds, changes, reviews, or debugs user-facing outcome feedback such as error, success, warning, or informational messages; toasts, snackbars, alerts, banners, dialogs, inline errors, empty or failed regions, form submission feedback, retry actions, crash or initialization fallbacks, domain-outcome presentation, or mapping technical failures to localized product copy. Trigger even when the request only mentions showError, showSuccess, notifications, server messages, error.message, mutation onError or onSuccess UX, or choosing how and where to tell the user what happened.
---

# User Feedback

Present one clear outcome at the boundary that owns the user interaction. Choose
the surface from the duration, scope, severity, and recovery needs of the
message; do not route every outcome through a toast.

Feedback is presentation. It does not decide whether a failure is logged,
reported as an incident, retried, or converted.

## Inspect The Existing Feedback System

Before adding feedback:

1. Find the repository's UI primitives and existing toast, snackbar, banner,
   alert, dialog, and error-region components.
2. Find any feedback facade or event bus and the runtime composition root that
   renders it.
3. Check how localization, accessibility announcements, durations, actions, and
   duplicate messages are handled.
4. Trace whether the same interaction already presents inline state or
   navigation that makes another message redundant.
5. Find the technical error owner in **error-handling** before adding failure
   feedback.

Reuse the established presentation path. Do not introduce another toast library
or global event bus for one feature.

## Choose The Smallest Correct Surface

Use the surface that matches the problem:

| Surface | Prefer for |
| --- | --- |
| Field message | Validation or server failure tied to one form field |
| Inline region | A failed or unavailable section with local retry |
| Toast or snackbar | A transient action outcome that does not block work |
| Banner | Persistent page- or application-level degraded state |
| Dialog or native alert | A blocking decision or consequence requiring acknowledgement |
| Route or subtree fallback | A render failure that invalidates that region |
| Application fallback | Initialization or unrecoverable root failure |

Do not use a transient toast for a persistent failure. Do not replace an entire
page when only one region failed. Do not show both an inline message and a toast
for the same outcome unless they serve demonstrably different purposes.

Read `references/presentation-patterns.md` for adaptable mapping, inline,
mutation, and fallback examples.

## Use Product Copy, Not Technical Messages

Do not show `error.message` to the user by default. It may be technical,
unstable, unlocalized, unsafe, or meaningless outside developer diagnostics.

Prefer:

1. a localized message selected by a known typed outcome;
2. a user-safe message explicitly guaranteed by the external contract;
3. a localized operation-specific fallback.

Do not string-match a technical message to choose feedback when a status, code,
or discriminant exists. Do not expose stack traces, request bodies, provider
responses, identifiers the user cannot act on, or secret material.

## Map Meaningful Outcomes Explicitly

Keep feedback mapping close to the feature or shared domain boundary that owns
the meaning:

```ts
function getProjectUpdateFeedback(error: unknown): Feedback {
  if (isApprovalRequired(error)) {
    return {
      kind: "warning",
      message: translate("Approval is required before this change can apply."),
    }
  }

  return {
    kind: "error",
    message: translate("Unable to update the project."),
  }
}
```

Promote a mapper to shared `common` code only when genuinely different
consumers need the same meaning. Follow **file-structure** for its placement.

Keep mapping pure: it selects presentation data. It must not report, log,
navigate, mutate state, or emit the feedback itself.

## Keep Feedback And Reporting Independent

Avoid APIs such as:

```ts
showError(error, { report: true })
```

A presentation helper cannot know whether a query cache, global listener, or
caller already reported the failure. Hidden reporting creates duplicates and
makes UI code control observability policy.

When one interaction boundary owns both decisions, keep them visible:

```ts
catch (error) {
  reportError(error, {
    module: "projects",
    context: { projectId },
  })

  showError({
    message: translate("Unable to update the project."),
  })
}
```

If a central observer already reports the failure, call only the feedback path
locally.

## Treat Success As Optional Feedback

Do not emit a success toast after every completed operation.

Skip it when success is already obvious because the UI navigated, closed,
updated the resource, or displayed the new state. Use explicit success
feedback when completion would otherwise be ambiguous, delayed, performed in
the background, or especially consequential.

Success copy should state the completed result, not merely `"Success"`.

## Keep Validation Near The Field

Client validation and server field errors belong beside their fields. Do not
replace them with a global toast.

Use a form-level or toast failure only for a submission problem that cannot be
assigned to one field. Present one path: after mapping a server error to a
field, do not also show the same failure as a general error.

Follow **forms** for schemas, React Hook Form, `setError`, submission state, and
field composition.

## Make Recovery Actionable

When the user can recover, present the relevant action:

- retry the failed region or operation;
- reload or restart after an unrecoverable boundary;
- return to a stable route;
- reauthenticate when the session is no longer valid;
- open the resource created by an asynchronous or approval flow;
- dismiss a transient message.

Do not offer retry when the operation is unsafe to repeat or when
**error-handling** has not established a retry policy.

Preserve the user's entered data and surrounding usable state whenever
possible.

## Handle Query And Mutation Feedback Locally

Central Query or Mutation cache callbacks may own technical reporting, but they
do not know whether a toast, inline state, or no message is appropriate.

- Present initial query failure in the failed region.
- Preserve cached data during a background refetch failure when possible.
- Present mutation feedback at the interaction boundary.
- Avoid global automatic error toasts for all queries and mutations.
- Keep cache invalidation and canonical lifecycle behavior in
  **api-integration**.

## Keep Feedback Accessible And Localized

- Use the existing localization system for product copy.
- Ensure dynamic updates are announced through the established accessible
  toast, live-region, alert, or native mechanism.
- Keep actionable controls keyboard and screen-reader reachable.
- Do not rely on color or an icon alone to communicate severity.
- Give persistent messages a visible dismissal or recovery path when
  appropriate.
- Avoid durations too short for the message or action.

## Verify The Result

Before finishing:

- one outcome produces one presentation;
- the surface matches the scope and persistence of the outcome;
- technical `error.message` is not exposed accidentally;
- copy is localized and actionable;
- known outcomes use typed fields rather than string matching;
- success feedback is not redundant with visible state;
- field errors remain attached to fields;
- feedback does not secretly log or report;
- retry is safe and owned by the technical error flow;
- accessibility and dismissal behavior match existing primitives.

## Related Skills

- Catch ownership, reporting, retry, cancellation, and boundaries →
  **error-handling**.
- Form validation, submission, and server field errors → **forms**.
- UI primitives, composition, async-region rendering, and fallback components
  → **components**.
- Query and mutation lifecycle, typed transport errors, and invalidation →
  **api-integration**.
- Translation keys, interpolation, plurals, and locale-reactive copy →
  **localization**.
- Placement and promotion of shared feedback modules → **file-structure**.
- Feedback notifications arriving from a native host →
  **native-integration**.
