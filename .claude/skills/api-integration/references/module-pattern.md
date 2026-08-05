# Source Module Pattern

This example uses TanStack Query because it makes the registries concrete.
Replace the transport and cache adapter without changing the ownership model.

## Suggested layout

```text
api/
  client.ts
  provider.tsx
  modules/
    accounts/
      index.ts
      source.ts
      contract.generated.ts
```

`source.ts` adapts the repository's typed transport. `contract.generated.ts` is
optional: it may instead live in a generated package or be unnecessary when a
typed SDK, schema registry, or RPC client already exposes the contract.

## Shared API infrastructure

```ts
// api/client.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();
```

```tsx
// api/provider.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { queryClient } from "./client";

export function APIProvider({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

## Source module

```ts
// api/modules/accounts/index.ts
import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
} from "@tanstack/react-query";

import { queryClient } from "@/api/client";

import {
  accountsSource,
  type AccountFilters,
  type RenameAccountRequest,
} from "./source";

export const accountsKeys = {
  all: ["accounts"] as const,
  lists: () => [...accountsKeys.all, "list"] as const,
  list: (filters: AccountFilters) => [...accountsKeys.lists(), filters] as const,
  infinite: (filters: AccountFilters) =>
    [...accountsKeys.lists(), "infinite", filters] as const,
  details: () => [...accountsKeys.all, "detail"] as const,
  detail: (id: string) => [...accountsKeys.details(), id] as const,
  mutations: () => [...accountsKeys.all, "mutation"] as const,
};

export async function listAccounts(filters: AccountFilters) {
  return accountsSource.list({ filters });
}

export async function getAccount(id: string) {
  return accountsSource.get({ id });
}

export async function renameAccount(variables: {
  id: string;
  request: RenameAccountRequest;
}) {
  return accountsSource.rename(variables);
}

export const accountsQueries = {
  list: (filters: AccountFilters) =>
    queryOptions({
      queryKey: accountsKeys.list(filters),
      queryFn: () => listAccounts(filters),
    }),
  infinite: (filters: AccountFilters) =>
    infiniteQueryOptions({
      queryKey: accountsKeys.infinite(filters),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam }) =>
        listAccounts({
          ...filters,
          cursor: pageParam,
        }),
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: accountsKeys.detail(id),
      enabled: Boolean(id),
      queryFn: () => getAccount(id),
    }),
};

export const accountsMutations = {
  rename: () =>
    mutationOptions({
      mutationKey: [...accountsKeys.mutations(), "rename"] as const,
      mutationFn: renameAccount,
      onSettled: (_data, _error, variables) => {
        void queryClient.invalidateQueries({ queryKey: accountsKeys.lists() });
        void queryClient.invalidateQueries({
          queryKey: accountsKeys.detail(variables.id),
        });
      },
    }),
};
```

The source adapter, contract types, keys, operations, and cache definitions form
one reviewable integration boundary. A large module may split these into named
files without changing its public surface.

`source.ts` may wrap generated HTTP code, a schema-inferred command transport,
or a typed RPC/SDK client. It propagates transport errors unchanged unless the
project already has a specialized error flow that owns their conversion. See
`transport-examples.md`; no variant is the default.

## Consumer

```tsx
const account = useQuery(accountsQueries.detail(accountId));
const renameAccount = useMutation(accountsMutations.rename());

function submit(request: RenameAccountRequest) {
  renameAccount.mutate(
    { id: accountId, request },
    {
      onSuccess: () => {
        showSuccess("Saved");
        closeDialog();
      },
    },
  );
}
```

The per-call callback adds UI behavior without replacing the mutation
registry's cache lifecycle.
