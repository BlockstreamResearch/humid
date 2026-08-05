---
name: localization
description: Use whenever work adds, changes, reviews, or debugs user-facing copy in an application that uses localization, including visible text, labels, placeholders, accessibility text, validation messages, notifications, translation calls, source-text or semantic keys, locale resources, interpolation, plurals, context variants, typed translation APIs, enum labels, locale switching, or translation linting. Trigger even when the request mentions only changing UI wording without explicitly naming i18n.
---

# Localization

When an application uses localization, every user-facing message goes through
its translation layer:

- visible text and actions;
- labels, descriptions, placeholders, and hints;
- empty, loading, success, and error messages;
- validation feedback and notifications;
- `aria-label`, image `alt`, and other accessibility text.

An application without localization should not receive a speculative partial
i18n layer. Adopt this skill when localization already exists, is being
introduced, or a translatable-string audit is explicitly requested.

Inspect the installed localization library, initialization, source locale,
resource files, translator APIs, plural/context conventions, and validation
commands before changing copy.

## Use Source Text As The Default Key

For ordinary UI copy, use the canonical source-language text itself as the
translation key:

```ts
translate("Cancel");
translate("Create a new project");
translate("Changes are saved automatically");
```

The source catalog repeats the source text as its value:

```json
{
  "Cancel": "Cancel",
  "Changes are saved automatically": "Changes are saved automatically",
  "Create a new project": "Create a new project"
}
```

This makes the application searchable from its interface: copying visible text
and searching the repository should lead directly to the resource and ordinary
call sites.

Do not replace ordinary copy with invented page-tree, component, kebab-case, or
UI-role identifiers such as:

```text
projects.details.header.delete-project-btn
settings.notifications.description-body
```

File location and presentation role are not stable message identities. Moving a
component or changing a label into a button must not rename its translation.

Use the exact source message, including meaningful capitalization and
punctuation. A wording change creates a new source key and requires existing
translations to be reviewed. Remove the obsolete key after migrating every call
site.

## Reuse Meaning, Disambiguate Context

Repeated source text is not inherently a collision.

- Same text and same meaning → reuse one key.
- Same text but different meaning or required translation → disambiguate it.

Prefer the localization engine's context feature:

```ts
translate("Open", { context: "action" });
translate("Open", { context: "state" });
```

Store the base message and the engine's contextual variants in every locale.
For example, i18next uses its configured `contextSeparator` (`_` by default):

```jsonc
// source locale
{
  "Open": "Open",
  "Open_action": "Open",
  "Open_state": "Open"
}
```

```jsonc
// another locale
{
  "Open": "Відкрити",
  "Open_action": "Відкрити",
  "Open_state": "Відкрито"
}
```

The call site passes the unsuffixed source key and semantic context. The
localization engine resolves the appropriate contextual resource key:

```text
translate("Open", { context: "action" }) -> Open_action
translate("Open", { context: "state" })  -> Open_state
```

Do not append the context suffix manually at call sites. Follow the installed
engine's exact separator, fallback, typing, and plural/context composition
rules. Keep a base entry when the engine uses it as the non-contextual fallback.

Context describes linguistic meaning, not file placement. Add a translator
comment when the library or catalog supports one.

If the established runtime has no context mechanism, use the project's explicit
disambiguation convention while keeping the source text searchable, for
example:

```ts
translate("Open|action");
translate("Open|state");
```

```jsonc
// source locale
{
  "Open|action": "Open",
  "Open|state": "Open"
}
```

```jsonc
// another locale
{
  "Open|action": "Відкрити",
  "Open|state": "Відкрито"
}
```

Do not invent a delimiter or alternate context system when the project already
has one.

Short words such as `"Save"`, `"Cancel"`, `"Continue"`, and `"Name"` follow the
same rule. Use the source text directly when its meaning is shared; add context
only for a real ambiguity.

## Keep Whole Messages Together

Message length alone is not a reason to invent a semantic key. A sentence or
paragraph that forms one translatable unit may remain its own source-text key:

```ts
translate(
  "Deleting this project will permanently remove its settings and associated data.",
);
```

Never split natural language into separately translated fragments merely to
shorten a key. Translators must be able to reorder the whole message.

Use a stable semantic id with an explicit source/default value only when the
content is genuinely managed as structured content rather than ordinary UI
copy, for example:

- multi-paragraph help or onboarding content;
- localized Markdown or rich text;
- legal documents;
- large independently maintained content blocks.

```ts
translate("project-deletion-explanation", {
  defaultValue: projectDeletionExplanation,
});
```

## Interpolation, Plurals, And Formatting

Keep placeholders inside the complete source message and pass their values
through the translator:

```ts
translate("Delete {{name}}?", { name });
translate("Created by {{author}}", { author });
```

Do not concatenate or template together fragments of natural language. A
rendered message containing a dynamic value may not exactly match its source
key, but its static wording remains searchable.

### Plurals

Use the localization engine's plural/select support for counts and grammatical
variants. Do not choose English singular/plural forms with component logic.
Follow the installed engine's resource format because plural categories differ
between locales.

For example, i18next JSON v4 resolves plural variants from a base key and the
required `count` option:

```ts
translate("{{count}} project", { count });
```

```jsonc
// source locale
{
  "{{count}} project": "{{count}} projects",
  "{{count}} project_zero": "No projects",
  "{{count}} project_one": "{{count}} project",
  "{{count}} project_other": "{{count}} projects"
}
```

```jsonc
// a locale with additional plural categories
{
  "{{count}} project": "{{count}} проєктів",
  "{{count}} project_zero": "Немає проєктів",
  "{{count}} project_one": "{{count}} проєкт",
  "{{count}} project_few": "{{count}} проєкти",
  "{{count}} project_many": "{{count}} проєктів",
  "{{count}} project_other": "{{count}} проєкту"
}
```

The base entry keeps the ordinary typed lookup and non-contextual fallback
explicit. The engine selects `_zero`, `_one`, `_few`, `_many`, or `_other`
according to the active locale. A locale only defines the categories required
by the installed engine and its plural rules; do not copy English categories
blindly.

For i18next, the option must be named `count`. Other engines may use another
resource shape or ICU message syntax. Reuse the project's installed plural
mechanism and verify its current official documentation.

Context and plural variants may be combined. Pass both `count` and `context`;
the engine composes their resource suffixes. Never construct `_one`, `_other`,
or combined suffixes in application code.

### Locale-Aware Formatting

Format dates, times, numbers, percentages, units, and currencies with the
project's locale-aware formatter. Do not interpolate locale-insensitive
`toString()` output into a translated sentence.

When the localization engine supports `Intl`-backed formatting, keep the
formatter inside the complete message. For i18next versions that support its
built-in formatters:

```jsonc
{
  "Total: {{amount, currency(USD)}}": "Total: {{amount, currency(USD)}}",
  "Updated on {{date, datetime}}": "Updated on {{date, datetime}}",
  "{{progress, number(style: percent; maximumFractionDigits: 1)}} complete": "{{progress, number(style: percent; maximumFractionDigits: 1)}} complete"
}
```

```ts
translate("Total: {{amount, currency(USD)}}", {
  amount: 1250,
});

translate("Updated on {{date, datetime}}", {
  date: updatedAt,
  formatParams: {
    date: {
      dateStyle: "medium",
      timeStyle: "short",
    },
  },
});

translate(
  "{{progress, number(style: percent; maximumFractionDigits: 1)}} complete",
  {
    progress: 0.725,
  },
);
```

The active locale controls separators, currency presentation, ordering, and
date/time wording. Other locales keep the same placeholders but may move them
within the message.

If the localization engine does not own formatting, format through the
project's locale-aware formatter and interpolate the result:

```ts
translate("Total: {{amount}}", {
  amount: formatCurrency(amount, { currency: "USD", locale: activeLocale }),
});
```

## Use Stable Domain Keys For Enums And Machine Values

Enums and other closed machine-defined sets already have stable identities.
They do not need source text as their lookup key.

When a value is presented in multiple ownership areas, keep one exhaustive,
typed translator:

```ts
const STATUS_KEYS = {
  [Status.Active]: "enums.status.active",
  [Status.Archived]: "enums.status.archived",
} satisfies Record<Status, TranslationKey>;

export const translateStatus = (status: Status) =>
  translate(STATUS_KEYS[status]);
```

The resource values remain searchable:

```json
{
  "enums.status.active": "Active",
  "enums.status.archived": "Archived"
}
```

Apply this to stable statuses, roles, modes, categories, and similar constants.
The key must be mechanically derived from the domain value, not creatively
named after one component.

Use a local source-text key when a one-off label only happens to resemble an
enum value. Do not route unrelated copy through a shared enum translator.

## Derive Key Types From The Source Catalog

The canonical source locale is the key authority. Derive key and language types
from real resources instead of maintaining manual unions:

```ts
import source from "./locales/en.json";

export const resources = {
  en: { translation: source },
  uk: { translation: uk },
} as const;

export type Language = keyof typeof resources;
export type TranslationKey = keyof typeof source;
```

For a flat source-text catalog, prefer the simple `keyof` type. Do not build a
recursive path utility that:

- permits intermediate objects as translation results;
- generates both dot and bracket forms;
- duplicates the localization library's own key inference;
- slows TypeScript as the catalog grows.

When the library supports resource-based type augmentation, connect it directly
to the source catalog. For i18next:

```ts
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    keySeparator: false;
    nsSeparator: false;
    returnObjects: false;
    resources: {
      translation: typeof source;
    };
  }
}
```

Keep runtime configuration and type augmentation aligned. A flat natural-key
i18next catalog normally requires:

```ts
i18n.init({
  resources,
  keySeparator: false,
  nsSeparator: false,
});
```

Otherwise periods or colons inside sentences may be interpreted as key or
namespace separators. Follow the exact installed library version and official
documentation when configuring this foundation.

If the project uses multiple catalogs or namespaces, split them for real
ownership, loading, or deployment reasons. Do not recreate page-tree
namespacing merely to organize keys visually.

JSON resources provide useful key inference but may not preserve enough literal
information for fully typed interpolation variables. If stronger typing is
needed, prefer source resources defined with `as const` in TypeScript or
generated declarations. Never hand-maintain a second resource interface.

## Keep Translator APIs Honest

Prefer the localization library's typed translator directly. A project wrapper
may adapt ergonomics, but it must preserve:

- the inferred key type;
- option and interpolation types;
- context and plural overloads;
- the real return type.

Do not weaken the boundary with `any`, `as unknown as string`, or a general
`string` key.

Do not custom-memoize translated results by only `key + options`. The active
locale, loaded resources, and runtime language changes also affect the result.
Use the localization engine's own resource behavior unless the project has a
proven locale-aware caching abstraction.

Inside reactive UI, use the project's translation hook so the component
responds to locale changes. Outside React, use the established direct
translator.

Do not eagerly translate module-level constants when the application can change
locale without reloading. Store keys and translate at the consumption boundary,
or construct locale-sensitive schemas/options through the project's established
flow. Module-level translation is acceptable only when the application
deliberately reloads on locale change or otherwise guarantees reevaluation.

Do not pass a translator through component props when each component can obtain
the project translator from its normal context.

## Validate Every Locale

Typing call sites from the source locale proves that a used source key exists.
It does not automatically prove that every other locale has the same keys.

Treat localization validation as layered. The foundation must detect missing,
extra, and orphaned keys; incompatible placeholders; incomplete plural/context
variants; invalid resource shapes; and stale keys after copy changes.

No single successful command proves all of these properties. Combine the
repository's resource validator, exact parity or policy checks, source usage
analysis when it understands the project's translator API, and type-checking.

When using or considering `@lingual/i18n-check`, read
[references/i18n-check.md](references/i18n-check.md) before trusting it. Its
resource checks are useful, but source parsing and i18next plurals have limits.

Prefer automatic correction for deterministic ordering, but do not silently
fabricate translations. A source-language value copied into another locale must
remain visibly untranslated according to the project's workflow.

Keep resource keys deterministically sorted when the project stores catalogs in
version control.

## What Not To Translate

- User-generated or backend-provided content.
- User names, record ids, filenames, and machine-readable codes.
- Proper-noun brands that intentionally remain identical across locales.
- Raw dynamic values that should be formatted rather than translated.

Translate the surrounding static message as one unit. Do not assume
backend-provided labels are localized unless the API contract guarantees it.

## Workflow

1. Inspect the localization runtime, source locale, resources, typed translator,
   context/plural conventions, and validation commands.
2. Find every affected user-facing string, including accessibility,
   notification, and validation copy.
3. Search the exact source text before adding it.
4. Reuse an existing key when both source text and meaning match.
5. Add linguistic context when identical source text needs a different
   translation.
6. Use a typed domain key only for an enum/machine value or a justified
   structured-content exception.
7. Add the source entry and update other locales through the project's
   translation workflow.
8. Replace the call site with the typed translator and keep interpolation or
   plural logic inside the message.
9. Remove replaced or stale keys.
10. Run locale sorting/parity validation, formatting, linting, and type-checking.

## Avoid

- invented page/component/element keys for ordinary copy;
- namespaces derived from file-system position;
- duplicating identical messages per call site;
- sharing identical source text that needs different linguistic context;
- semantic ids for ordinary sentences merely because they are long;
- sentence fragments and translated-string concatenation;
- runtime-generated or untyped translation keys;
- manual key unions or duplicate resource interfaces;
- recursive path types for a flat source-text catalog;
- casts that hide object or missing-key results;
- custom translation memoization that ignores locale;
- assuming source-locale typing validates every locale.

## Related Skills

- Localized validation messages and form lifecycle → **forms**.
- User-facing component copy and locale-reactive rendering → **components**.
- Localized success, error, warning, notification, and recovery feedback →
  **user-feedback**.
- Placement of localization modules and resource files → **file-structure**.
