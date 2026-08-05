---
name: file-structure
description: Use whenever work creates, moves, renames, deletes, splits, merges, or relocates files or directories; introduces a module or folder; adds or expands barrel files; changes which files are public or private through entrypoints or package exports; or requires deciding where code should live. Do not use for content-only edits that preserve existing file placement.
---

# File Structure

Keep the source tree aligned with real ownership. Apply this skill before making
structural changes, not after files have already been placed.

## Inspect Before Placing

Read the affected tree before deciding where anything belongs:

1. Find the nearest existing files with the same responsibility.
2. Inspect local naming, co-location, entrypoint, test, and export conventions.
3. Trace current consumers and package exports before moving or hiding a file.
4. Prefer the repository's coherent existing convention. Do not introduce a
   parallel structure merely because another project uses it.
5. If nearby conventions conflict, follow the boundary that best matches actual
   ownership and keep the change scoped. Do not reorganize unrelated code.

## Apply Recursive Encapsulation

Treat every directory that represents a module as the same recursive structure:

- its entrypoint is the public boundary seen by consumers outside that directory;
- files owned only by that module live inside the directory, behind the boundary;
- an owned child may become a module with its own entrypoint and private
  implementation;
- repeat the same public-outside, private-inside rule at every depth.

This is about visibility and ownership, not file kind. Apply it equally to
components, hooks, schemas, services, adapters, formatters, fixtures, tests,
state, and any other implementation.

In this model, consumers sit outside or above the boundary they consume, while
owned implementation goes inward or below it. "Above" and "below" describe the
ownership tree; they do not require every consumer to be located in a literal
parent directory.

Place every file at the narrowest boundary that contains all current consumers:

- one file or module only: keep it inside that owner's boundary;
- several files in one feature: keep it at that feature boundary;
- sibling features or pages: place it at their nearest shared owner;
- unrelated features or packages: promote it only when multiple real consumers
  require the same contract or behavior.

Do not promote code for hypothetical reuse. The second real use is evidence to
reconsider placement, not an automatic reason to create a global abstraction.
When consumers change, move the file to their new narrowest common owner instead
of exporting a private path merely to avoid relocation.

Keep supporting files near the module they verify or support unless the
repository has a stronger established convention.

## Name Child Folders from Their Context

Name an owning module by its capability, domain, or responsibility. Inside that
owner, use the conventional role folder that best explains the children:
`components/`, `hooks/`, `schemas/`, `services/`, `adapters/`, `formatters/`,
`fixtures/`, `tests/`, or the repository's established equivalent.

These names are contextual, not global categories. `Feature/components/` means
components private to Feature; `Feature/hooks/` means hooks private to Feature.
Do not lift them into a broad root-level dump merely because several files share
the same technical kind.

Avoid ambiguous catch-all locations such as `misc/`, overly broad `helpers/`,
overly broad `utils/`, `common/`, `shared/`, or a global `types.ts` when their
contents do not form one coherent boundary. Prefer a precise contextual role,
direct co-location, or the actual capability name.

Do not create a directory for a single leaf file unless the directory establishes
a real module boundary, owns private children, or follows a required repository
convention. Promote a growing leaf to a folder without changing its public import
surface when practical.

## Separate Public Surface from Implementation

Structure packages and substantial modules by visibility:

- expose only intentional, stable entrypoints at the public boundary;
- use an `internal/` directory only when it represents a real package- or
  application-level non-public boundary and the repository uses that model;
- organize `internal/` by capability rather than turning it into another dump;
- use each internal module's entrypoint as its local boundary;
- do not expose internal implementation again through package subpath exports;
- keep platform-specific entrypoints separate when consumers genuinely need
  different runtime surfaces.

Do not create `internal/` inside every owner. A file is already private when it
lives inside its owner's directory and is absent from that owner's public
entrypoint. Use the contextual role folders above, or keep a private leaf beside
the entrypoint.

## Minimize Barrels

Prefer direct imports. Do not add an `index.ts` to every directory merely because
the directory exists.

Distinguish three different uses:

- an implementation entrypoint such as `Component/index.tsx`, where the file
  defines or composes the public component, is not a barrel;
- a small curated public surface at a real package or feature boundary may
  re-export a few intentional capabilities;
- a convenience file that mechanically re-exports directory contents is a
  barrel and should normally not exist.

Allow a barrel only when the boundary is real, the exported set is small,
cohesive, stable, and immediately obvious, and consumers should not know the
internal paths. There is no useful numeric limit: aim for one curated surface per
real public module, not one barrel per folder.

Inside private implementation, import the owning file directly. Never:

- create chains where one barrel imports from or re-exports another barrel;
- use `export *` to sweep a directory into an API;
- re-export private files merely to shorten an import path;
- combine unrelated capabilities behind one convenience entrypoint;
- keep expanding a barrel after the origin and ownership of its exports stop
  being obvious.

When barrels begin multiplying, replace convenience re-exports with direct
imports before the dependency graph becomes opaque or cyclic.

## Recursive Structure Examples

Choose the shape from the current owner and its children. These examples express
the same rule in different contexts; they are not mandatory folder names.

### Component ownership

```text
Workspace/
├── index.tsx
├── hooks/
│   └── use-workspace-state.ts
└── components/
    ├── Canvas.tsx
    └── Toolbar/
        ├── index.tsx
        ├── hooks/
        │   └── use-toolbar-shortcuts.ts
        └── components/
            └── ToolbarAction.tsx
```

`use-workspace-state.ts` is shared by Workspace children. The shortcut hook and
action component are private to Toolbar and therefore live inside Toolbar.

### Composed hook

```text
hooks/
└── use-selection/
    ├── index.ts
    └── hooks/
        ├── use-keyboard-selection.ts
        └── use-pointer-selection.ts
```

The surrounding feature imports `use-selection/index.ts`. Its composing hooks
stay behind that hook module's boundary.

### Recursive feature ownership

```text
FileUpload/
├── index.tsx
├── components/
│   ├── Dropzone/
│   │   ├── index.tsx
│   │   └── hooks/
│   │       └── use-drag-state.ts
│   └── UploadProgress.tsx
├── hooks/
│   ├── use-upload-progress.ts
│   └── use-upload-queue.ts
└── validators/
    ├── file-size.ts
    └── file-type.ts
```

The root `hooks/` and `validators/` contain behavior shared inside FileUpload.
`use-drag-state.ts` belongs only to Dropzone, so it moves into that component's
own boundary. The same rule therefore repeats inside the feature without an
undifferentiated `internal/`.

### Single private leaf

```text
Summary/
├── index.tsx
└── format-total.ts
```

Do not create `internal/`, `helpers/`, or `formatters/` for one private leaf
unless local convention requires it. Direct co-location already communicates
ownership.

### Real package-level internal boundary

```text
package/src/
├── index.ts
├── native.ts
└── internal/
    ├── protocol/
    │   └── index.ts
    └── runtime/
        └── index.ts
```

Here `internal/` is meaningful: package consumers may import only the declared
public entrypoints, while several non-public capabilities remain package-owned.

Outsiders import the public module, not its private children. Do not expose an
internal file merely because another internal file needs it; place both under
their narrowest common owner.

When any leaf gains private children, promote it to a folder with an entrypoint
and continue the same structure recursively.

## Defer Route And Page Trees To Routing

When a structural change creates, moves, or reorganizes route branches, page
boundaries, route declarations, or route-tree assembly, apply **routing** as the
authoritative structure. Use this skill recursively for the non-routing
implementation inside the page or layout boundary selected by **routing**.

## Make Structural Changes Complete

When moving, renaming, splitting, merging, or deleting files:

1. Update all imports, aliases, entrypoints, package exports, tests, fixtures,
   tooling configuration, and generated registries that reference the old path.
2. Move the implementation; do not leave duplicate old and new copies unless a
   deliberate compatibility layer is required.
3. Preserve public import paths when the public contract is not meant to change.
4. Remove obsolete empty structure only when it is fully owned by the change.
5. Search for the old path and old exported names after the move.
6. Run the repository's focused structural verification, then its required
   typecheck, lint, tests, and build as appropriate.
