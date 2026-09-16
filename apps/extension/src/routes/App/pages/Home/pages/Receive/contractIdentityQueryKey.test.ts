import { describe, expect, test } from "bun:test";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";

import { contractIdentityQueryKey } from "./contractIdentityQueryKey";

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
