import { describe, expect, mock, test } from "bun:test";

/**
 * Which builder call a recipient gets, and nothing else.
 *
 * The substitutes hold themselves to the chain library's own rule — the ordinary recipient path
 * refuses an address with no blinding key, and the explicit path refuses one that has it — so a
 * branch chosen wrongly here fails the way it would fail in a browser rather than passing green.
 */
type Recorded = { calls: string[] };

const recorded: Recorded = { calls: [] };

function makeBuilder() {
	const builder = {
		addExplicitRecipient(address: { isBlinded: () => boolean }, satoshi: bigint) {
			if (address.isBlinded()) {
				throw new Error("Address must be explicit");
			}

			recorded.calls.push(`explicit:${satoshi}`);

			return builder;
		},
		addLbtcRecipient(address: { isBlinded: () => boolean }, satoshi: bigint) {
			if (!address.isBlinded()) {
				throw new Error("Address must be confidential");
			}

			recorded.calls.push(`lbtc:${satoshi}`);

			return builder;
		},
		addRecipient(address: { isBlinded: () => boolean }, satoshi: bigint) {
			if (!address.isBlinded()) {
				throw new Error("Address must be confidential");
			}

			recorded.calls.push(`asset:${satoshi}`);

			return builder;
		},
		drainLbtcTo() {
			recorded.calls.push("drain");

			return builder;
		},
		drainLbtcWallet() {
			return builder;
		},
		finish() {
			return { toString: () => "pset" };
		},
	};

	return builder;
}

const POLICY = "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d";
let blinded = true;

mock.module("../../loadLwkWasm", () => ({
	loadLwkWasm: async () => ({
		Address: class {
			isBlinded() {
				return blinded;
			}
			isMainnet() {
				return false;
			}
			toString() {
				return blinded ? "tlq1_confidential" : "tex1_explicit";
			}
		},
		AssetId: { fromString: (id: string) => ({ id }) },
		TxBuilder: class {
			constructor() {
				return makeBuilder() as never;
			}
		},
	}),
}));

mock.module("../../sync-worker/createSyncWorkerClient", () => ({
	getSyncWorkerClient: () => ({ broadcast: async () => ({ txid: "sent" }) }),
}));

const { sendTransfer } = await import("./index");

const account = {
	accountIdentifier: "acct",
	chain: {},
	chainId: "bip122:liquid-testnet",
	implementation: {
		network: {},
		signer: { sign: (pset: unknown) => pset },
		wollet: { finalize: (pset: unknown) => pset },
	},
	policyAssetId: `bip122:liquid-testnet/asset:${POLICY}`,
	rawPolicyAssetId: POLICY,
} as never;

async function send(overrides: Record<string, unknown> = {}) {
	recorded.calls = [];

	return sendTransfer(
		account,
		{ amount: "5000", recipientAddress: "irrelevant", ...overrides } as never,
		POLICY,
	);
}

describe("which builder call a recipient gets", () => {
	test("a confidential recipient takes the ordinary L-BTC path", async () => {
		blinded = true;

		await expect(send()).resolves.toEqual({ txid: "sent" });
		expect(recorded.calls).toEqual(["lbtc:5000"]);
	});

	// Without this the wallet cannot pay an explicit output at all, and a contract action can
	// only spend an explicit one — so nobody could fund one, including from their own wallet.
	test("an unconfidential recipient takes the explicit path", async () => {
		blinded = false;

		await expect(send()).resolves.toEqual({ txid: "sent" });
		expect(recorded.calls).toEqual(["explicit:5000"]);
	});

	test("draining takes the address as it is, either way", async () => {
		blinded = false;
		await send({ sendAll: true });
		expect(recorded.calls).toEqual(["drain"]);

		blinded = true;
		await send({ sendAll: true });
		expect(recorded.calls).toEqual(["drain"]);
	});
});
