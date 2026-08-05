# Contract and Transport Variants

These variants are peers. Select the one supported by the source authority;
none changes the source-module, key-registry, query-registry, mutation-registry,
or invalidation pattern.

## Generated HTTP contract

Use this when an OpenAPI or similar machine-readable contract is authoritative.

```ts
import createClient from "openapi-fetch";

import type { components, paths } from "./contract.generated";

export type CreateAccountRequest =
  components["schemas"]["CreateAccountRequest"];

const accountsClient = createClient<paths>({ baseUrl });

export async function createAccount(request: CreateAccountRequest) {
  const { data, error } = await accountsClient.POST("/accounts", {
    body: request,
  });

  if (error) {
    throw error;
  }

  return data;
}
```

The generator owns `contract.generated.ts`. The module may export readable
aliases derived from it, but must not restate DTO fields.

The same approach applies to GraphQL, protobuf/gRPC, and other contract
generators: generate the client or types, then adapt them behind the source
module.

## Runtime schema or registry

Use this when the source publishes executable schemas or a typed command
registry.

```ts
import type { resources } from "@vendor/source-registry";
import type { z } from "zod";

type ListAccountsParams = z.infer<
  typeof resources.accounts.list.request.shape.details
>;

export async function listAccounts(params: ListAccountsParams) {
  const response = await sendTypedCommand<
    typeof resources.accounts.list
  >({
    action: "get",
    resource: "/accounts",
    details: params,
  });

  if (response.status !== "success") {
    throw response;
  }

  return response;
}
```

Types are inferred from the registry that also validates runtime messages.
The typed failure envelope is propagated unchanged. Avoid both a parallel
hand-written DTO layer and an invented error-conversion layer.

## Typed SDK or native RPC client

Use this when the client method already carries request and response types.

```ts
import { AccountsNativeModule } from "@internal/accounts/native/client";
import { queryOptions } from "@tanstack/react-query";

export const accountsKeys = {
  all: ["accounts"] as const,
  detail: (id: string) => [...accountsKeys.all, "detail", id] as const,
};

export const accountsQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: accountsKeys.detail(id),
      enabled: Boolean(id),
      queryFn: () => AccountsNativeModule.getAccount({ id }),
    }),
};
```

No local request or response aliases are required when inference remains
readable at the call site. The typed RPC contract and client factory are the
type authority.

## Dedicated unauthenticated client

Some operations must not use normal source middleware. Authentication refresh
is the common example:

```ts
const sourceClient = createAuthenticatedClient<paths>();
const authClient = createBareClient<authPaths>();
```

Keep this exception explicit inside the owning source module or client
infrastructure. Do not add component-level flags that disable middleware for
individual calls.

## Contract-derived projection

Client code sometimes needs a subset or combination of contract types. Derive
it instead of copying it:

```ts
type SearchParams = NonNullable<
  paths["/accounts"]["get"]["parameters"]["query"]
>;

type AccountSummary = Pick<
  components["schemas"]["Account"],
  "id" | "display_name"
>;
```

If the shape exists only for a form or view, keep it with that form or view.
It is not part of the API contract.
