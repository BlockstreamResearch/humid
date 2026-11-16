// oxlint-disable no-extraneous-class -- this stands in for a chain-library class the real code constructs with new; a function would not be substitutable for it
import { describe, expect, mock, test } from "bun:test";

type Recorded = { calls: string[] };

const recorded: Recorded = { calls: [] };
const FEE_SATS = 31n;

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
			recorded.calls.push("sendAll");

			return builder;
		},
		drainLbtcWallet() {
			return builder;
		},
		feeRate(rate: number) {
			recorded.calls.push(`rate:${rate}`);

			return builder;
		},
		finish() {
			return {
				outputs: () => [
					{ amount: () => 5000n, scriptPubkey: () => ({ bytes: () => new Uint8Array(22) }) },
					{ amount: () => FEE_SATS, scriptPubkey: () => ({ bytes: () => new Uint8Array() }) },
				],
				toString: () => "pset",
			};
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

mock.module("../readWalletData", () => ({
	readWalletBalanceForAsset: () => "100000",
}));

const { quoteTransfer, sendTransfer } = await import("./index");

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

const TOKEN = "b".repeat(64);

async function send(
	overrides: Record<string, unknown> = {},
	rawAssetId = POLICY,
	fee?: { feeRateSatsPerKvb: number; feeSats: string },
) {
	recorded.calls = [];

	return sendTransfer(
		account,
		{ amount: "5000", recipientAddress: "irrelevant", ...overrides } as never,
		rawAssetId,
		fee,
	);
}

describe("which builder call a recipient gets", () => {
	test("a confidential recipient takes the ordinary L-BTC path", async () => {
		blinded = true;

		await expect(send()).resolves.toEqual({ txid: "sent" });
		expect(recorded.calls).toEqual(["lbtc:5000"]);
	});

	test("an explicit recipient takes the explicit path", async () => {
		blinded = false;

		await expect(send()).resolves.toEqual({ txid: "sent" });
		expect(recorded.calls).toEqual(["explicit:5000"]);
	});

	test("a confidential recipient of an issued asset keeps the ordinary asset path", async () => {
		blinded = true;

		await expect(send({}, TOKEN)).resolves.toEqual({ txid: "sent" });
		expect(recorded.calls).toEqual(["asset:5000"]);
	});

	test("an explicit recipient of an issued asset takes the same explicit path", async () => {
		blinded = false;

		await expect(send({}, TOKEN)).resolves.toEqual({ txid: "sent" });
		expect(recorded.calls).toEqual(["explicit:5000"]);
	});

	test("sending all takes the address as it is, either way", async () => {
		blinded = false;
		await send({ sendAll: true });
		expect(recorded.calls).toEqual(["sendAll"]);

		blinded = true;
		await send({ sendAll: true });
		expect(recorded.calls).toEqual(["sendAll"]);
	});
});

describe("the fee shown is the fee paid", () => {
	test("a quote builds at the given rate and reads the fee output", async () => {
		blinded = true;
		recorded.calls = [];

		await expect(
			quoteTransfer(
				account,
				{ amount: "5000", recipientAddress: "irrelevant" } as never,
				POLICY,
				250,
			),
		).resolves.toEqual({ amount: "5000", feeRateSatsPerKvb: 250, feeSats: "31" });
		expect(recorded.calls).toEqual(["rate:250", "lbtc:5000"]);
	});

	test("sending all quotes what is left after the fee", async () => {
		const quote = await quoteTransfer(
			account,
			{ amount: "0", recipientAddress: "irrelevant", sendAll: true } as never,
			POLICY,
			100,
		);

		expect(quote.amount).toBe((100_000n - FEE_SATS).toString());
	});

	test("a send at the reviewed fee goes through", async () => {
		await expect(
			send({}, POLICY, { feeRateSatsPerKvb: 250, feeSats: FEE_SATS.toString() }),
		).resolves.toEqual({ txid: "sent" });
		expect(recorded.calls).toEqual(["rate:250", "lbtc:5000"]);
	});

	test("a send whose fee moved since the review is refused", async () => {
		await expect(send({}, POLICY, { feeRateSatsPerKvb: 250, feeSats: "30" })).rejects.toThrow(
			"The network fee changed. Please review the transfer again.",
		);
	});
});
