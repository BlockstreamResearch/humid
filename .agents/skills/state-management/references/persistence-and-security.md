# Persistence, Hydration, Guards, And Secrets

Use this reference before implementing or reviewing persisted state,
authentication storage, secure adapters, migrations, hydration, or application
guards.

## Contents

- [Persist A Stable Subset](#persist-a-stable-subset)
- [Validate, Migrate, And Merge](#validate-migrate-and-merge)
- [Hydration State](#hydration-state)
- [Guard Composition](#guard-composition)
- [Storage Failure Semantics](#storage-failure-semantics)
- [Secret Placement](#secret-placement)
- [Platform Options](#platform-options)

## Persist A Stable Subset

Persist only state that must survive a restart:

```ts
import { create } from "zustand"
import {
  combine,
  createJSONStorage,
  persist,
} from "zustand/middleware"

const usePreferencesStore = create(
  persist(
    combine(
      {
        theme: "system" as ThemePreference,
        density: "comfortable" as DensityPreference,
        previewTheme: null as ThemePreference | null,
      },
      (set) => ({
        setTheme: (theme: ThemePreference) => set({ theme }),
      }),
    ),
    {
      name: "preferences",
      version: 1,
      storage: createJSONStorage(() => applicationStorage),
      partialize: (state) => ({
        theme: state.theme,
        density: state.density,
      }),
    },
  ),
)
```

`previewTheme`, actions, hydration state, request state, and runtime handles do
not persist.

Do not read or parse the serialized Zustand value from another module. If
pre-React bootstrap needs a persisted preference, expose that through the
storage capability that owns the contract.

## Validate, Migrate, And Merge

Persisted data is untrusted `unknown` input. Validate it with the repository's
existing schema mechanism:

```ts
const persistedPreferencesSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  density: z.enum(["compact", "comfortable"]),
})

type PersistedPreferences = z.infer<
  typeof persistedPreferencesSchema
>
```

Use an explicit persisted return type:

```ts
partialize: (state): PersistedPreferences => ({
  theme: state.theme,
  density: state.density,
})
```

Migration receives `unknown`:

```ts
migrate: (persistedState, version) => {
  if (version === 0) {
    const legacy = legacyPreferencesSchema.parse(persistedState)

    return {
      theme: legacy.colorMode,
      density: "comfortable",
    }
  }

  return persistedPreferencesSchema.parse(persistedState)
}
```

Zustand's default merge is shallow. Merge nested defaults deliberately:

```ts
merge: (persistedState, currentState) => {
  const persisted = persistedWorkspaceSchema.parse(persistedState)

  return {
    ...currentState,
    workspace: {
      ...currentState.workspace,
      ...persisted.workspace,
    },
  }
}
```

Do not add a migration function that silently converts every invalid critical
value into an empty default. Decide whether the data is disposable or whether
failure must block and offer recovery.

## Hydration State

Synchronous storage may hydrate during store creation. Asynchronous storage
hydrates later. Add a gate only when consumers must not observe defaults before
hydration.

For simple noncritical state, a boolean may be sufficient:

```ts
type HydrationState = {
  hasHydrated: boolean
}
```

For critical state, preserve loading and error:

```ts
type HydrationStatus =
  | { status: "hydrating"; error: null }
  | { status: "ready"; error: null }
  | { status: "error"; error: unknown }
```

Several secure stores may share a hydration registry:

```ts
type SecureStoresHydration = {
  session: HydrationStatus
  accounts: HydrationStatus
}
```

Set `skipHydration: true` when native preparation, an unlock step, SSR, or
another prerequisite must happen before the first read:

```ts
persist(stateCreator, {
  name: "session",
  storage: createJSONStorage(() => secureSessionStorage),
  skipHydration: true,
})
```

Start hydration explicitly when the adapter requires preparation:

```ts
export async function hydrateSessionStore() {
  hydrationStore.useStore.getState().begin("session")

  try {
    await sessionVault.prepare()
    await sessionStore.useStore.persist.rehydrate()
    hydrationStore.useStore.getState().succeed("session")
  } catch (error) {
    hydrationStore.useStore.getState().fail("session", error)
    throw error
  }
}
```

Keep the original error. Do not invent a normalized error representation solely
for hydration.

Do not assume `await set(...)` is a portable durable-write contract. If a
workflow must wait until encrypted persistence completes before locking,
navigating, or making another request, expose and test that guarantee through
the persistence capability.

## Guard Composition

Compose one prerequisite per guard:

```tsx
function Application({ children }: PropsWithChildren) {
  return (
    <SecureStoresGuard>
      <SessionGuard>
        <AccessGuard>
          <CriticalDataGuard>
            <ApplicationLayout>{children}</ApplicationLayout>
          </CriticalDataGuard>
        </AccessGuard>
      </SessionGuard>
    </SecureStoresGuard>
  )
}
```

The order is the contract:

1. Secure persistence is readable.
2. Session presence is known.
3. Authorization is settled.
4. Critical application data is available.
5. The application layout and its consumers may mount.

Each guard selects only its prerequisite and owns its fallback:

```tsx
function SecureStoresGuard({ children }: PropsWithChildren) {
  const hydration = hydrationStore.useStore((state) => state.session)

  if (hydration.status === "hydrating") {
    return <FullScreenSpinner />
  }

  if (hydration.status === "error") {
    return (
      <SecureStorageError
        error={hydration.error}
        onRetry={hydrateSessionStore}
      />
    )
  }

  return children
}
```

Do not let a guard infer logout, denial, or missing data from a value whose
prerequisite has not passed. A hydration error must not automatically clear the
session.

Hydration may start in the application entrypoint so no synchronization effect
is needed:

```ts
void hydrateSecureStores().catch(() => {
  // The hydration registry retains the original error for its guard.
})

createRoot(rootElement).render(<Application />)
```

An established query layer is also acceptable for async bootstrap when its
pending, retry, and error lifecycle fits the operation.

## Storage Failure Semantics

Return `null` only for genuine absence:

```ts
async function getItem(name: string) {
  const encryptedValue = backingStorage.getItem(name)

  if (encryptedValue === null) return null

  return nativeSecurity.decrypt(encryptedValue)
}
```

Do not swallow decryption failure:

```ts
// Wrong: this changes "unreadable" into "missing".
async function getItem(name: string) {
  try {
    return await decrypt(backingStorage.getItem(name))
  } catch {
    return null
  }
}
```

The false “missing” result can hydrate empty defaults and later overwrite
recoverable encrypted data.

## Secret Placement

Secure storage protects data at rest. Once plaintext is returned to renderer
JavaScript, it may be reachable through application code, devtools, heap
snapshots, injected code, logs, or accidental persistence.

Prefer this separation:

```text
Zustand
  session status
  account identity
  expiration
  lock and hydration state

Private auth-client memory
  short-lived access token, only if renderer requests require it

Native or backend vault
  refresh token
  private keys
  long-lived credentials
```

An access token rarely needs reactivity. Prefer a private provider when the
renderer must hold it:

```ts
let accessToken: string | null = null

export const accessTokenProvider = {
  get: () => accessToken,
  set: (value: string | null) => {
    accessToken = value
  },
  clear: () => {
    accessToken = null
  },
}
```

This reduces accidental exposure but does not protect against full renderer
compromise.

Do not export raw private keys. Keep them non-exportable and expose operations:

```ts
type SigningCapability = {
  createKey: () => Promise<{
    keyId: string
    publicKey: string
  }>
  sign: (input: {
    keyId: string
    payload: Uint8Array
  }) => Promise<Uint8Array>
  deleteKey: (keyId: string) => Promise<void>
}
```

Zustand may keep `keyId`, `publicKey`, and readiness state. The private key stays
behind the capability.

When a raw key must temporarily enter JavaScript, keep it in the narrowest
lexical scope, prefer mutable byte buffers over immutable strings, never place
it in Zustand or persistence, and clear buffers as best effort. JavaScript
runtimes may retain copies, so do not claim guaranteed zeroization.

## Platform Options

Inspect the repository's threat model, existing native capabilities, and the
current official platform documentation before choosing an adapter. Security
semantics and fallbacks vary by operating system and runtime version.

Choose the strongest boundary the platform supports:

- Browser with backend: prefer a Backend-for-Frontend or HttpOnly, Secure,
  SameSite session so tokens never enter application JavaScript.
- Browser without backend mediation: keep short-lived access tokens in memory;
  never use `localStorage` or `sessionStorage` for credentials; require refresh
  token rotation or sender constraint when refresh tokens are issued.
- Web cryptography: prefer non-extractable `CryptoKey` handles for local key
  operations. They prevent raw export but cannot prevent compromised same-origin
  code from invoking an allowed operation.
- Electron or another desktop shell: keep secrets and cryptographic operations
  in the privileged native/main capability. Use OS Keychain, DPAPI, Secret
  Service, or a framework wrapper such as Electron `safeStorage`; verify that
  the selected Linux backend is not a plaintext fallback.
- Apple platforms: prefer Keychain and non-exportable key operations, using
  Secure Enclave where the required algorithm and lifecycle permit it.
- Android: prefer Android Keystore and hardware-backed, non-exportable keys when
  available.
- React Native or Expo: use the established Keychain/Keystore-backed secure
  storage adapter for small tokens and secrets; prefer native non-exportable key
  APIs over storing raw PEM keys.

For larger encrypted data, store ciphertext in ordinary application storage and
keep only its data-encryption or wrapping key in the OS vault.

Expose narrow native methods such as `sign`, `refreshSession`, and
`clearSession`. Never expose a generic `getSecret` or an unrestricted IPC
surface.
