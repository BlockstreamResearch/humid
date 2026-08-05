# i18n-check Integration Reference

Use this reference when a project already uses `@lingual/i18n-check`, when
introducing it, or when deciding whether its output is sufficient for a
localization change.

## Contents

- [Role And Boundaries](#role-and-boundaries)
- [Supported Checks](#supported-checks)
- [Recommended Commands](#recommended-commands)
- [Required Validation Layers](#required-validation-layers)
- [Day-To-Day Workflows](#day-to-day-workflows)
- [Source Usage Compatibility](#source-usage-compatibility)
- [Source-Text Key Edge Cases](#source-text-key-edge-cases)
- [Interpolation And Rich Messages](#interpolation-and-rich-messages)
- [Plurals And Context](#plurals-and-context)
- [Catalog And File Edge Cases](#catalog-and-file-edge-cases)
- [Ignore, Exclude, And Reporting](#ignore-exclude-and-reporting)
- [Version-Specific Caveats](#version-specific-caveats)
- [Integration Checklist](#integration-checklist)

## Role And Boundaries

Treat `i18n-check` as a resource compatibility checker, not as the complete
localization authority.

It is effective at comparing a canonical source locale with target locale files
and returning a non-zero exit code for detected problems. This makes it useful
for local validation, pre-commit hooks, and CI.

It does not translate copy, migrate renamed keys, judge translation quality, or
prove that every runtime localization path works. A successful run only proves
the checks that were actually enabled and supported by the installed version.

Inspect all of the following before configuring it:

1. The installed `@lingual/i18n-check` version.
2. The localization engine and message format.
3. The source locale and resource layout.
4. The project's translator functions, hooks, and rich-text components.
5. The runtime key, namespace, plural, and context separators.
6. Existing type-check, lint, extraction, and CI commands.

Consult the installed package and current official documentation instead of
assuming that behavior described for another version still applies:

- <https://lingual.dev/i18n-check/>
- <https://github.com/lingualdev/i18n-check>

## Supported Checks

The CLI exposes four checks:

| Check | Intended guarantee |
| --- | --- |
| `missingKeys` | A source key exists in each matched target resource. |
| `invalidKeys` | Source and target messages preserve compatible message elements. |
| `unused` | A source-locale key was not found in parsed application source. |
| `undefined` | A parsed application key does not exist in the source locale. |

By default, use `missingKeys` and `invalidKeys` as the dependable resource
validation layer. `unused` and `undefined` require `--unused`/`-u` and are only
reliable when the parser recognizes the project's actual call-site syntax.

For i18next messages, `invalidKeys` can detect common structural changes such
as:

- a missing, added, or renamed interpolation variable;
- escaped versus unescaped interpolation;
- changed i18next nesting expressions;
- missing or changed rich-text tags;
- changed interval-plural expressions supported by the parser.

It deliberately ignores ordinary source and target text differences. It cannot
determine whether a translation is accurate, grammatical, current, or
appropriate for its context.

The CLI can load one or multiple locale folders and supports common layouts
such as one file per locale, one folder per locale, and matching multiple files
inside each locale folder. Discovery and matching do not prove that an expected
locale or file exists; validate that separately.

Format behavior is version-specific. Inspect support for ICU, i18next,
react-intl, and next-intl in the installed package instead of assuming that
every check works equally for every format.

## Recommended Commands

Make the resource contract explicit:

```json
{
  "scripts": {
    "validate:i18n:resources": "i18n-check -l src/localization/locales -s en -f i18next -o missingKeys invalidKeys"
  }
}
```

Adjust paths, source locale, and format to the inspected project. Supported
resource inputs are JSON and YAML.

Run the resource check:

- after adding, removing, or changing localized copy;
- in the normal local validation workflow;
- in a pre-commit hook when it remains fast;
- in CI as the authoritative blocking gate.

Pre-commit alone is insufficient because it can be bypassed.

Only add source usage validation after a compatibility test:

```json
{
  "scripts": {
    "validate:i18n:usage": "i18n-check -l src/localization/locales -s en -f i18next -u src -o unused undefined"
  }
}
```

Do not merge this command into a blocking workflow merely because it runs. First
confirm that it finds representative calls through every project translator,
hook, component wrapper, namespace, context, and dynamic-key registry.

Prefer the standard reporter for actionable local and CI output. Use the
summary reporter only when exact affected keys are available through another
artifact.

When the CLI cannot represent the project's resource ownership, use the
package's documented public check functions to compose project tooling. Verify
the installed exports and keep project-specific policy checks outside the
package. Do not depend on private `dist/` modules.

## Required Validation Layers

Use `i18n-check` as one part of this stack:

| Layer | Responsibility |
| --- | --- |
| Resource validation | Missing source keys and structurally incompatible messages. |
| Project policy/parity validation | Expected locales/files, reverse base-key parity, plural/context completeness, and source-text policy. |
| Type-checking | Valid call-site keys, options, interpolation values, context, and count types. |
| Source usage analysis | Undefined and orphaned keys when the parser understands the project API. |
| Runtime or integration tests | Locale switching, fallback behavior, lazy resources, rich messages, and formatting. |
| Human review | Meaning, grammar, tone, cultural fit, and product terminology. |

The project-specific policy validator should cover gaps that `i18n-check` does
not reliably cover:

- an explicit manifest of supported locales and required resource files;
- bidirectional parity for ordinary keys and context identities after grouping
  locale-specific plural variants;
- target-only and orphaned keys;
- duplicate resource keys;
- source-text key conventions and justified semantic-key exceptions;
- required plural categories for each locale;
- combined context and plural variants;
- placeholder compatibility in target-only plural categories;
- deterministic resource ordering when required.

Do not weaken these guarantees to fit one tool. Extend the validation stack.

## Day-To-Day Workflows

### Add Copy

1. Search for an existing source message with the same meaning.
2. Add the source entry.
3. Add or explicitly queue every target translation through the established
   workflow.
4. Update the typed call site.
5. Run resource validation, project parity validation, and type-checking.

`missingKeys` should identify a target locale that did not receive the new
source key. It cannot create the translation.

### Change Source-Text Copy

A wording change is a key migration:

```ts
translate("Delete project?");
translate("Delete this project?");
```

Perform it atomically:

1. Find every call site of the old exact message.
2. Add the new source key.
3. Carry each existing translation to the new key and review it against the new
   meaning.
4. Update all call sites.
5. Remove the obsolete key from every locale.
6. Run resource validation, reverse parity, source usage validation when
   compatible, and type-checking.

`missingKeys` will report the new key when targets still contain only the old
key. It will not identify the change as a rename, migrate translations, or
report the old target-only key.

Capitalization, punctuation, and meaningful whitespace are part of a
source-text key. Even a small wording edit creates a distinct key.

### Change Interpolation

When changing:

```text
Hello {{name}}
Hello {{user}}
```

update the source message, every target message, the call-site option, and its
type. `invalidKeys` can catch a target that retained `{{name}}`; it does not
prove that the call site supplies `user`.

### Remove A Feature

Remove its call sites and owned source keys, then remove the same keys from
every target locale.

The basic resource check will not report target-only leftovers. Use reverse
parity and, when compatible, `unused`.

### Add A Locale Or Resource File

Register the locale in the project's explicit locale manifest, create every
required resource file, then run validation.

Do not depend on directory discovery to prove completeness. A checker cannot
report a locale or file that it was never told must exist.

## Source Usage Compatibility

The i18next source parser commonly recognizes direct forms such as:

```ts
t("Save");
i18n.t("Save");
const { t } = useTranslation();
t("Save");
```

It also recognizes `Trans` and can be given additional component wrapper names
through `--parser-component-functions`.

Do not assume that it recognizes project wrappers:

```ts
translate("Save");

const tx = useTranslate();
tx("Save");
```

The CLI option for additional component functions extends `Trans` component
recognition; it does not necessarily configure arbitrary translation function
or hook names. Verify the installed version before relying on wrapper support.

Do not rename a clear project API merely to satisfy a static parser. Prefer a
thin project-aware source checker or contribute configurable function support
upstream.

Avoid importing private `dist/` parser modules into permanent project tooling.
Internal package paths and options are not a stable public contract.

### Dynamic Keys

Static analysis cannot generally resolve:

```ts
t(`status.${status}`);
t(prefix + id);
translate(KEY_FROM_RUNTIME_DATA);
```

Prefer explicit typed registries for closed machine-defined values:

```ts
const STATUS_KEYS = {
  active: "enums.status.active",
  archived: "enums.status.archived",
} as const;
```

Validate the registry exhaustively with TypeScript and include it in the
project's localization policy check. Do not scatter ignores for dynamic keys.

### False Usage

Inspect whether the selected source paths include:

- tests and fixtures;
- stories and examples;
- generated code;
- comments containing `t(...)`;
- dead or unreachable modules.

These can keep a production key classified as used. Some parser versions scan
translation-looking calls in comments.

An unrelated application function named `t` can create the opposite problem:
the parser may treat its string argument as a translation key.

Object-returning calls may also cause a whole subtree to be skipped:

```ts
t("countries", { returnObjects: true });
```

Treat an unused report as static evidence that still requires ownership-aware
review.

### Namespaces

Test multiple namespaces explicitly. Some versions treat a key as used without
fully proving that it was used through the correct namespace.

Source-text keys containing `:` need particular care. A source parser may split:

```ts
t("Error: invalid value");
```

as namespace `Error` plus key ` invalid value`, even when runtime i18next uses
`nsSeparator: false` or natural-key detection.

Resource-only checks remain useful, but `unused` and `undefined` are unreliable
until this case passes a project smoke test.

## Source-Text Key Edge Cases

`i18n-check` compares resource keys; it does not enforce the project's key
policy.

Add project validation for these invariants:

- ordinary source-text keys follow the canonical source wording;
- the canonical source value has not silently drifted from its key;
- context variants intentionally differ from their base key;
- semantic keys are limited to enums, machine values, or documented structured
  content;
- a flat literal key cannot collide with an equivalent nested resource path.

Do not apply a universal `key === value` rule blindly. Context variants and
justified semantic keys legitimately differ:

```json
{
  "Open": "Open",
  "Open_action": "Open",
  "enums.status.active": "Active"
}
```

Literal periods and colons must agree with runtime `keySeparator` and
`nsSeparator` behavior. The resource checker does not prove runtime lookup.

Treat plural and context suffixes as reserved according to the installed
localization engine. A normal semantic key that accidentally ends in `_one` or
`_other` may be normalized as a plural form by tooling.

## Interpolation And Rich Messages

Use `invalidKeys` to protect the structural contract between source and target
messages, then keep call-site correctness in the type system.

Validate representative cases:

- reordered placeholders remain valid;
- renamed or missing placeholders fail;
- escaped and unescaped interpolation cannot be mixed accidentally;
- formatting directives preserve their arguments;
- nested translation expressions reference real keys;
- rich-text tags preserve the elements required by the renderer.

The checker may compare a set of message elements without proving their exact
semantic nesting, rendering behavior, or component binding.

It also does not validate:

- that a custom formatter is registered;
- that date, time, number, currency, or unit inputs have the right runtime type;
- that the active locale reaches the formatter;
- that a nested `$t(...)` reference resolves;
- that translated prose retained the intended meaning.

Test those boundaries through types and focused runtime tests.

## Plurals And Context

i18next plural categories vary by locale and are based on `Intl.PluralRules`.
The `count` option is required for plural selection. Context and plural suffixes
can be combined.

Consult the installed engine's current documentation:

- <https://www.i18next.com/translation-function/plurals>
- <https://www.i18next.com/translation-function/context>

Do not treat a successful i18next `missingKeys` check as proof of plural
completeness. Some `i18n-check` versions normalize plural suffixes to a base key.
Consequently, one existing target variant may satisfy the check even when other
required categories are absent.

For example, this target may pass base-key presence despite being incomplete:

```json
{
  "project_one": "{{count}} project"
}
```

Locale-specific categories can also escape structural comparison when the
source locale does not define the same category. A broken target `_few` or
`_many` message may therefore remain undetected.

The project policy validator must:

1. Determine cardinal categories for each supported locale.
2. Validate ordinal categories separately when used.
3. Treat `_zero` as an explicit optional override unless product requirements
   make it mandatory.
4. Require the correct variants for every pluralized base key.
5. Repeat the check for every context variant.
6. Validate interpolation elements across all target-only categories.
7. Respect the installed engine's configured plural and context separators.

Do not copy English plural categories into every locale merely to satisfy a
checker.

## Catalog And File Edge Cases

### Reverse Parity

The normal comparison direction is source to target. A target-only key can pass
`missingKeys` and `invalidKeys`.

Run a locale-aware reverse comparison or bidirectional parity check to find:

- old target keys left after a source-text rename;
- keys removed from the source but not from targets;
- accidental target-only additions.

Normalize recognized plural-category suffixes before deciding that a target key
is extra. Preserve context identity: a target-only context remains suspicious,
while a target locale may legitimately require `_few` or `_many` when the
source locale does not.

### Missing Files And Locales

Directory discovery only compares files it finds and can match. It does not
prove that a deleted locale or resource file was expected.

Maintain an explicit locale/resource manifest and verify it before content
comparison.

### Empty And Null Values

Verify installed-version behavior for empty strings, `null`, `false`, and
numeric values. Some implementations use truthiness for missing checks, making
an intentionally empty string appear missing.

Prefer string-valued leaf messages unless the established engine explicitly
supports another resource shape.

### Duplicate Keys

Standard `JSON.parse` accepts duplicate object keys and silently keeps the last
value. A checker that reads resources through `JSON.parse` cannot report the
overwritten definition.

Use a duplicate-aware JSON parser, formatter, or lint rule before running
resource comparison. YAML parser behavior must also be verified rather than
assumed.

### Nested And Flat Resources

Many checkers flatten nested objects into dotted paths. Avoid mixing:

```json
{
  "a.b": "flat",
  "a": {
    "b": "nested"
  }
}
```

This can produce a collision after flattening even when the raw JSON keys are
different.

### Unsupported Sources

The CLI resource loader supports JSON and YAML. TypeScript resource objects,
remote catalogs, generated bundles, or custom formats require a generation
step or public API integration.

Source parsing commonly covers `js`, `jsx`, `ts`, and `tsx`. Verify other
extensions such as `mjs`, `mts`, MDX, Vue, or Svelte before enabling blocking
usage checks.

## Ignore, Exclude, And Reporting

Use `--ignore` and `--exclude` only for an explicit, reviewed exception.

Each exception must identify:

- the exact key, locale, file, or ownership boundary;
- why the normal invariant does not apply;
- whether the exception is temporary;
- how removal will be detected.

Avoid broad wildcard ignores. Verify their matching semantics in the installed
version; some versions use substring matching for wildcard prefixes and can
silence unrelated keys.

Do not exclude an entire locale merely because it is incomplete unless product
policy explicitly allows that locale to ship incomplete.

Use the standard reporter when developers must fix individual keys. A summary
is useful for metrics, but counts alone are insufficient remediation output.

## Version-Specific Caveats

The following behaviors were observed in `@lingual/i18n-check@0.9.5`. Re-test
them when the installed version differs:

- the i18next source parser defaults to `t`, `useTranslation`,
  `withTranslation`, and `Trans`;
- custom `translate` and custom translation hooks are not configurable through
  the documented CLI;
- parsed keys containing `:` are split as namespace-prefixed keys;
- context usage normalization assumes `_`;
- plural suffixes are collapsed during missing and usage checks;
- namespace-aware usage matching is incomplete;
- `returnObjects: true` creates skippable key subtrees;
- source-file `--exclude` behavior does not necessarily match locale-file
  exclusion behavior;
- wildcard ignores use broad substring matching;
- missing checks treat falsy target values as absent;
- interpolation prefix/suffix comparison contains an implementation defect.

Do not preserve these limitations as timeless rules. They describe why the
installed tool must be tested against the real project instead of trusted by
name.

## Integration Checklist

Before declaring localization validation complete:

- [ ] Identify the canonical source locale.
- [ ] Verify every expected locale and resource file through a manifest.
- [ ] Run `missingKeys` and `invalidKeys`.
- [ ] Run locale-aware reverse or bidirectional base-key parity.
- [ ] Detect duplicate resource keys before parsing destroys that evidence.
- [ ] Validate source-text, context, and semantic-key conventions.
- [ ] Validate cardinal and ordinal plural categories per locale.
- [ ] Validate combined context/plural variants.
- [ ] Confirm placeholder compatibility in every locale-specific variant.
- [ ] Type-check keys, translator options, interpolation values, and `count`.
- [ ] Prove the source parser recognizes every project translator API before
      enabling `unused` or `undefined`.
- [ ] Test natural keys containing punctuation, especially `:` and `.`.
- [ ] Review every ignore or exclude exception.
- [ ] Run focused runtime tests for locale switching, fallback, lazy resources,
      formatting, and rich messages.
- [ ] Run the blocking validation in CI.
