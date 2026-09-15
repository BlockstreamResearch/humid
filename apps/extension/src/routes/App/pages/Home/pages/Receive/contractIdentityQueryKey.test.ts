import { describe, expect, test } from "bun:test";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";

import { contractIdentityQueryKey } from "./contractIdentityQueryKey";

/**
 * What the contract identity is cached under.
 *
 * The answer is held forever — it is a function of a key that does not change — so the key is
 * the whole of what decides whether a person is shown their own address or the last one read.
 * The address is rendered for one network: `tex1…` on testnet and `ex1…` on mainnet are the same
 * key written two ways, and only one of them can be funded on the chain that is selected.
 */
const GROUP = "account-group:one" as AccountGroupId;
const OTHER_GROUP = "account-group:two" as AccountGroupId;

describe("what the contract identity is cached under", () => {
	test("names the chain as well as the account", () => {
		expect(contractIdentityQueryKey(GROUP, "liquid:testnet")).toEqual([
			"contractIdentity",
			GROUP,
			"liquid:testnet",
		]);
	});

	// The failure this exists for: one account, two chains. Cached under the account alone and
	// kept forever, switching chains serves the previous network's address out of the cache —
	// and that address is what somebody then funds a contract action from.
	test("separates one account's two chains", () => {
		expect(contractIdentityQueryKey(GROUP, "liquid:testnet")).not.toEqual(
			contractIdentityQueryKey(GROUP, "liquid:mainnet"),
		);
	});

	test("separates two accounts on one chain", () => {
		expect(contractIdentityQueryKey(GROUP, "liquid:testnet")).not.toEqual(
			contractIdentityQueryKey(OTHER_GROUP, "liquid:testnet"),
		);
	});

	test("is the same key for the same pair, so the read happens once", () => {
		expect(contractIdentityQueryKey(GROUP, "liquid:testnet")).toEqual(
			contractIdentityQueryKey(GROUP, "liquid:testnet"),
		);
	});
});
