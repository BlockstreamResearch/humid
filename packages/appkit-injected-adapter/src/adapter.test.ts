import { describe, expect, test } from "bun:test";

import { CAIP25_METHODS, HUMID_METHOD_POLICY_PROPERTY } from "@humid/wallet-rpc";

import { HumidAdapter } from "./humid";
import { liquidTestnet } from "./liquid";
import type { InjectedRequestArguments } from "./types";

const SCOPE = liquidTestnet.caipNetworkId;

function adapterWith(policy: Record<string, boolean>) {
	const invoked: unknown[] = [];
	const request = async ({ method, params }: InjectedRequestArguments): Promise<unknown> => {
		if (method === CAIP25_METHODS.getSession) {
			return {
				scopedProperties: { [SCOPE]: { [HUMID_METHOD_POLICY_PROPERTY]: policy } },
				sessionScopes: {},
			};
		}

		invoked.push(params);

		return { balance: "150000000" };
	};
	const adapter = new HumidAdapter({ getProvider: () => ({ request }) as never });

	return { adapter, invoked };
}

describe("AppKit calls with no Liquid meaning", () => {
	const { adapter } = adapterWith({});

	for (const method of [
		"estimateGas",
		"sendTransaction",
		"writeContract",
		"writeSolanaTransaction",
		"grantPermissions",
		"revokePermissions",
	] as const) {
		test(`${method} fails instead of faking success`, async () => {
			await expect((adapter[method] as () => Promise<unknown>)()).rejects.toThrow(
				`does not support AppKit's ${method}`,
			);
		});
	}
});

describe("amounts in base units", () => {
	const { adapter } = adapterWith({});

	test("parse honours the decimals", () => {
		expect(adapter.parseUnits({ decimals: 8, value: "1.5" })).toBe(150_000_000n);
		expect(adapter.parseUnits({ decimals: 8, value: "0.00000001" })).toBe(1n);
		expect(adapter.parseUnits({ decimals: 0, value: "42" })).toBe(42n);
	});

	test("parse refuses what is not an amount at that precision", () => {
		for (const value of ["", ".", "1.2.3", "-1", "1e8", "0.000000001"]) {
			expect(() => adapter.parseUnits({ decimals: 8, value })).toThrow();
		}
	});

	test("format honours the decimals", () => {
		expect(adapter.formatUnits({ decimals: 8, value: 150_000_000n })).toBe("1.5");
		expect(adapter.formatUnits({ decimals: 8, value: 1n })).toBe("0.00000001");
		expect(adapter.formatUnits({ decimals: 8, value: 0n })).toBe("0");
		expect(adapter.formatUnits({ decimals: 8, value: -250_000_000n })).toBe("-2.5");
	});
});

describe("the balance AppKit shows", () => {
	test("is the wallet's own when the session reads the balance without a prompt", async () => {
		const { adapter, invoked } = adapterWith({ getBalance: true });

		expect(
			await adapter.getBalance({
				address: "id",
				caipNetwork: liquidTestnet,
				chainId: liquidTestnet.id,
			}),
		).toEqual({ balance: "1.5", symbol: "tL-BTC" });
		expect(invoked).toEqual([{ request: { method: "getBalance" }, scope: SCOPE }]);
	});

	test("is never read when reading would open a prompt", async () => {
		const { adapter, invoked } = adapterWith({ getBalance: false });

		expect(
			await adapter.getBalance({
				address: "id",
				caipNetwork: liquidTestnet,
				chainId: liquidTestnet.id,
			}),
		).toEqual({ balance: "0", symbol: "tL-BTC" });
		expect(invoked).toEqual([]);
	});
});
