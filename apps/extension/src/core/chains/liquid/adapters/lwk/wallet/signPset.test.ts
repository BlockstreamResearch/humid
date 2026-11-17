import { Buffer } from "buffer";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import type * as Lwk from "lwk_wasm";

import { WALLET_RPC_ERROR_REASONS } from "@/core/wallet-rpc/errors";

import { buildCoinControlPset } from "../../../../../../../../web/src/lib/pset";
import type {
	LiquidUtxoSnapshot,
	LiquidWalletAccount,
} from "../../../application/backends/LiquidWalletBackend";
import { parseLiquidSignPsetParams } from "../../../domain/pset/validation";
import { lwk } from "../lwkWasmForTests";
import { blindPset } from "./blindPset";
import { getWalletUtxosForAsset } from "./getUTXOs";
import { PsetMaps } from "./PsetMaps";
import { WalletCoins } from "./WalletCoins";

function signatureCounts(pset: string) {
	return PsetMaps.parse(pset).inputs.map((input) => input.signatures.size);
}

async function exerciseSigning() {
	mock.module("../loadLwkWasm", () => ({ loadLwkWasm: async () => lwk }));
	mock.module("../sync-worker/createSyncWorkerClient", () => ({
		getSyncWorkerClient: () => {
			throw new Error("Unexpected broadcast");
		},
	}));
	// Module-loading boundary: install the isolated WASM loader before importing consumers.
	const { blindAndInspectPset, signPset } = await import("./signPset");
	const root = new URL("../../../../../../../../../", import.meta.url);
	const fixtureDirectory = new URL("lwk/lwk_wasm/test_data/update_with_mnemonic/", root);
	const text = async (name: string) =>
		(await readFile(new URL(name, fixtureDirectory), "utf8")).trim();
	const require = createRequire(import.meta.url);
	const liquidjs = require(
		require.resolve("liquidjs-lib", {
			paths: [new URL("apps/web/", root).pathname],
		}),
	);
	const resources: { free(): void }[] = [];
	const own = <T extends { free(): void }>(value: T): T => {
		resources.push(value);
		return value;
	};
	try {
		const network = own(lwk.Network.testnet());
		const mnemonic = own(new lwk.Mnemonic(await text("mnemonic.txt")));
		const signer = own(new lwk.Signer(mnemonic, network));
		const descriptor = own(new lwk.WolletDescriptor(await text("descriptor.txt")));
		const wollet = own(new lwk.Wollet(network, descriptor));
		wollet.applyUpdate(
			own(
				lwk.Update.deserializeDecryptedBase64(
					await text("update_serialized_encrypted.txt"),
					descriptor,
				),
			),
		);
		const rawAssetId = own(network.policyAsset()).toString();
		const account = {
			chainId: "liquid:testnet",
			implementation: { signer, wollet },
		} as LiquidWalletAccount;
		const coin = getWalletUtxosForAsset(account, rawAssetId).find(
			(utxo) => BigInt(utxo.amount) > 1000n,
		)!;
		const destination = own(own(wollet.address(10)).address()).toString();
		const request = buildCoinControlPset({
			inputs: [coin],
			outputAmounts: [BigInt(coin.amount) - 1000n],
			feeSats: 1000n,
			destinationAddress: destination,
			policyAssetHex: rawAssetId,
		});
		const callerPset = liquidjs.Pset.fromBase64(request.pset);
		callerPset.inputs[0]!.sighashType = 130;
		const params = parseLiquidSignPsetParams({
			...request,
			pset: callerPset.toBase64(),
		});
		const review = await blindAndInspectPset(account, params.pset);
		expect(review.fees).toEqual([{ asset: rawAssetId, amount: "1000" }]);
		expect(review.netEffect).toEqual([{ asset: rawAssetId, amount: "-1000" }]);
		expect(review.inputs).toEqual([
			{ amount: String(coin.amount), asset: rawAssetId, index: 0, owned: true, sighashType: 130 },
		]);
		expect(params.signInputs[0]!.sighashTypes).toEqual([1]);
		const reviewed = own(new lwk.Pset(review.pset));
		expect(signatureCounts(review.pset)).toEqual([0]);
		const signing = {
			broadcast: false,
			reviewedPset: review.pset,
			signInputs: params.signInputs,
		};
		const signed = await signPset(account, signing);
		expect(signed.txid).toBeUndefined();
		const signedPset = own(new lwk.Pset(signed.pset));
		expect(signatureCounts(signed.pset)).toEqual([1]);
		expect(own(signedPset.extractTx()).toString()).toBe(own(reviewed.extractTx()).toString());
		expect(signedPset.inputs().map((input) => own(input).sighash())).toEqual([130]);

		const mixedRequest = buildCoinControlPset({
			inputs: [coin],
			outputAmounts: [BigInt(coin.amount) - 3000n, 1000n, 1000n],
			feeSats: 1000n,
			destinationAddress: destination,
			policyAssetHex: rawAssetId,
		});
		const mixedPset = liquidjs.Pset.fromBase64(mixedRequest.pset);
		mixedPset.outputs[2]!.blindingPubkey = undefined;
		mixedPset.outputs[2]!.blinderIndex = undefined;
		const mixedParams = parseLiquidSignPsetParams({
			...mixedRequest,
			pset: mixedPset.toBase64(),
		});
		const mixedReview = await blindAndInspectPset(account, mixedParams.pset);
		expect(mixedReview.fees).toEqual([{ asset: rawAssetId, amount: "1000" }]);
		expect(mixedReview.netEffect).toEqual([{ asset: rawAssetId, amount: "-1000" }]);
		expect(mixedReview.outputs[2]).toMatchObject({
			amount: "1000",
			asset: rawAssetId,
			index: 2,
		});
		expect(mixedReview.outputs.map((output) => output.owned)).toEqual([true, true, true, false]);
		const mixedSigned = await signPset(account, {
			broadcast: false,
			reviewedPset: mixedReview.pset,
			signInputs: mixedParams.signInputs,
		});
		expect(mixedSigned.txid).toBeUndefined();
		expect(own(own(new lwk.Pset(mixedSigned.pset)).extractTx()).toString()).toBe(
			own(own(new lwk.Pset(mixedReview.pset)).extractTx()).toString(),
		);
		expect((await blindAndInspectPset(account, mixedReview.pset)).pset).toBe(mixedReview.pset);
		const tampered = Buffer.from(mixedReview.pset, "base64");
		const amount = Buffer.alloc(8);
		amount.writeBigUInt64LE(BigInt(coin.amount) - 3000n);
		const amountOffset = tampered.indexOf(Buffer.concat([Buffer.from([1, 3, 8]), amount]));
		expect(amountOffset).toBeGreaterThan(4);
		tampered.writeBigUInt64LE(BigInt(coin.amount) - 3001n, amountOffset + 3);
		await expect(blindAndInspectPset(account, tampered.toString("base64"))).rejects.toMatchObject({
			message: expect.stringMatching(/blind proof/i),
		});

		const tickAsset = "22".repeat(32);
		const walletScript = Buffer.from(coin.scriptPubKey, "hex");
		const foreignScript = Buffer.from("0014" + "77".repeat(20), "hex");
		const explicitSpend = (txid: string, vout: number, funding: number, fundingTxOut?: string) => {
			const source = liquidjs.Creator.newPset({
				inputs: [
					new liquidjs.CreatorInput("1".repeat(64), 0),
					new liquidjs.CreatorInput("2".repeat(64), 0),
					new liquidjs.CreatorInput(txid, vout),
				],
				outputs: [
					new liquidjs.CreatorOutput(rawAssetId, 50_000, walletScript),
					new liquidjs.CreatorOutput(tickAsset, 1, Buffer.from("6a", "hex")),
					new liquidjs.CreatorOutput(rawAssetId, funding - 1_000, walletScript),
					new liquidjs.CreatorOutput(rawAssetId, 1_000),
				],
			});
			for (const [index, inputAsset, inputValue, inputScript] of [
				[0, rawAssetId, 50_000, foreignScript],
				[1, tickAsset, 1, foreignScript],
				[2, rawAssetId, funding, walletScript],
			] as const) {
				const input = source.inputs[index]!;
				input.witnessUtxo = {
					script: inputScript,
					asset: liquidjs.AssetHash.fromHex(inputAsset).bytes,
					value: liquidjs.ElementsValue.fromNumber(inputValue).bytes,
					nonce: Buffer.alloc(1),
				};
				input.requiredHeightLocktime = undefined;
				input.requiredTimeLocktime = undefined;
			}
			const maps = PsetMaps.parse(source.toBase64());
			if (fundingTxOut) maps.inputs[2]!.spend(fundingTxOut);
			const pset = own(new lwk.Pset(maps.toString()));
			pset.addDetails(wollet);
			return pset;
		};
		await expect(
			blindAndInspectPset(account, explicitSpend("3".repeat(64), 0, 10_000).toString()),
		).rejects.toMatchObject({
			data: { reason: WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST },
		});
		const legacyPset = explicitSpend(coin.txid, coin.vout, Number(coin.amount), coin.txOut);
		const legacyReview = await blindAndInspectPset(account, legacyPset.toString());
		expect(legacyReview.pset).toBe(legacyPset.toString());
		expect(legacyReview.fees).toEqual([{ asset: rawAssetId, amount: "1000" }]);
		expect(legacyReview.netEffect).toEqual([{ asset: rawAssetId, amount: "49000" }]);
		const legacySigned = await signPset(account, {
			broadcast: false,
			reviewedPset: legacyReview.pset,
			signInputs: [{ address: coin.address, index: 2, sighashTypes: [1] }],
		});
		const legacySignedPset = own(new lwk.Pset(legacySigned.pset));
		expect(own(legacySignedPset.extractTx()).toString()).toBe(
			own(legacyPset.extractTx()).toString(),
		);
		expect(legacySigned.pset).not.toBe(legacyReview.pset);
		await expect(
			signPset(account, {
				broadcast: false,
				reviewedPset: legacyReview.pset,
				signInputs: [{ address: coin.address, index: 0, sighashTypes: [1] }],
			}),
		).rejects.toMatchObject({
			data: { reason: WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST },
		});

		await expect(signPset(account, { ...signing, signInputs: [] })).rejects.toMatchObject({
			data: { reason: WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST },
		});
		await expect(
			signPset(account, {
				...signing,
				signInputs: [{ ...params.signInputs[0]!, index: 1 }],
			}),
		).rejects.toMatchObject({
			data: { reason: WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST },
		});
	} finally {
		for (let i = resources.length - 1; i >= 0; i--) resources[i]!.free();
	}
}

test("coin-control review discloses effective sighash and signing preserves the reviewed transaction", async () => {
	if (process.env.LWK_SIGNING_CHILD === "1") return exerciseSigning();
	// Isolate loader overrides from other Bun test modules while using real WASM.
	const child = Bun.spawn(
		[
			process.execPath,
			"test",
			fileURLToPath(import.meta.url),
			"--test-name-pattern",
			"coin-control review",
		],
		{
			cwd: fileURLToPath(new URL("../../../../../../../../../", import.meta.url)),
			env: { ...process.env, LWK_SIGNING_CHILD: "1" },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect(exitCode, stdout + stderr).toBe(0);
}, 30_000);

mock.module("../loadLwkWasm", () => ({ loadLwkWasm: async () => lwk }));
mock.module("../sync-worker/createSyncWorkerClient", () => ({
	getSyncWorkerClient: () => ({}),
}));
const { signPset } = await import("./signPset");

const asset = lwk.AssetId.fromString("0123456789abcdef".repeat(4));
const otherAsset = lwk.AssetId.fromString("22".repeat(32));
const script = new lwk.Script("0014" + "33".repeat(20));
const blindingKey = lwk.SecretKey.fromBytes(new Uint8Array(32).fill(68));
const blindingPublicKey = lwk.PublicKey.fromSecretKey(blindingKey);
const wollet = new lwk.Wollet(
	lwk.Network.regtestDefault(),
	new lwk.WolletDescriptor(
		`ct(slip77(${"55".repeat(32)}),elwpkh(${blindingPublicKey.toString()}))`,
	),
);
let signedSource = "";
let signerTransform: ((pset: Lwk.Pset) => Lwk.Pset) | undefined;
let coins: LiquidUtxoSnapshot[] = [];

const account = {
	implementation: {
		wollet,
		signer: {
			sign: (pset: Lwk.Pset) => {
				signedSource = pset.toString();
				return signerTransform ? signerTransform(pset) : pset;
			},
		},
	},
} as never;

function fixture(
	funding = 10_000n,
	fundingOutput?: Lwk.TxOut,
	confidentialPayout = true,
	omitFundingWitness = false,
	fundingOutpoint?: Lwk.OutPoint,
	blinderIndex = 2,
) {
	let builder = lwk.PsetBuilder.newV2().setFallbackLocktime(new lwk.LockTime(123));
	for (const [index, inputAsset, value] of [
		[0, asset, 50_000n],
		[1, otherAsset, 1n],
		[2, asset, funding],
	] as const) {
		let input = lwk.PsetInputBuilder.fromPrevout(
			index === 2 && fundingOutpoint
				? fundingOutpoint
				: lwk.OutPoint.fromParts(new lwk.Txid(String(index + 1).repeat(64)), 0),
		);
		if (index !== 2 || !omitFundingWitness)
			input = input.witnessUtxo(
				index === 2 && fundingOutput
					? fundingOutput
					: lwk.TxOut.fromExplicit(script, inputAsset, value),
			);
		builder = builder.addInput(input.build());
	}
	for (const [outputAsset, value, confidential] of [
		[asset, 50_000n, true],
		[otherAsset, 1n, false],
		[asset, funding - 1_000n, true],
		[asset, 1_000n, false],
	] as const) {
		let output = lwk.PsetOutputBuilder.newExplicit(
			confidential ? script : new lwk.Script("6a"),
			value,
			outputAsset,
		);
		if (confidential && confidentialPayout)
			output = output.blindingPubkey(blindingPublicKey).blinderIndex(blinderIndex);
		builder = builder.addOutput(output.build());
	}
	return builder.build();
}

function holding(
	outpoint: Lwk.OutPoint,
	txOut: Lwk.TxOut,
	secrets: Lwk.TxOutSecrets,
	spendable = true,
): LiquidUtxoSnapshot {
	const confidential = txOut.isPartiallyBlinded();
	return {
		address: "wallet-address",
		amountSats: secrets.value().toString(),
		blindingSecrets: confidential
			? {
					asset: secrets.asset().toString(),
					assetBlindingFactor: secrets.assetBlindingFactor().toString(),
					value: Number(secrets.value()),
					valueBlindingFactor: secrets.valueBlindingFactor().toString(),
				}
			: undefined,
		confidential,
		rawAssetId: secrets.asset().toString(),
		scriptPubKey: script.toString(),
		spendable,
		txid: outpoint.txid().toString(),
		txOut: txOut.toString(),
		vout: outpoint.vout(),
	};
}

function holdFixtureInputs(pset: Lwk.Pset) {
	coins = pset.inputs().map((input, index) => {
		const inputAsset = index === 1 ? otherAsset : asset;
		const value = [50_000n, 1n, 10_000n][index]!;
		return holding(
			lwk.OutPoint.fromParts(input.previousTxid(), input.previousVout()),
			lwk.TxOut.fromExplicit(script, inputAsset, value),
			lwk.TxOutSecrets.fromExplicit(inputAsset, value),
		);
	});
}

function explicitFunding(spendable = true) {
	const previous = fixture(11_000n, undefined, false).extractTx();
	const outpoint = lwk.OutPoint.fromParts(previous.txid(), 2);
	coins = [
		holding(
			outpoint,
			previous.outputs[2]!,
			lwk.TxOutSecrets.fromExplicit(asset, 10_000n),
			spendable,
		),
	];
	return fixture(10_000n, previous.outputs[2], true, true, outpoint);
}

function withWitness(pset: Lwk.Pset) {
	const maps = PsetMaps.parse(pset.toString());
	maps.inputs[0]!.entries.set("08", Buffer.from("010101", "hex"));
	return new lwk.Pset(maps.toString());
}

function withSignature(pset: Lwk.Pset, inputIndex: number, scalar = 1) {
	const maps = PsetMaps.parse(pset.toString());
	maps.inputs[inputIndex]!.entries.set(
		`02${blindingPublicKey.toString()}`,
		Buffer.from([48, 6, 2, 1, scalar, 2, 1, 1, 1]),
	);
	return new lwk.Pset(maps.toString());
}

function withExplicitOutputIndices(pset: Lwk.Pset) {
	let builder = lwk.PsetBuilder.newV2();
	for (const input of pset.inputs()) builder = builder.addInput(input);
	for (const [index, output] of pset.outputs().entries()) {
		builder = builder.addOutput(
			index === 1 || index === 3
				? lwk.PsetOutputBuilder.newExplicit(
						output.scriptPubkey(),
						output.amount()!,
						output.asset()!,
					)
						.blinderIndex(0)
						.build()
				: output,
		);
	}
	return builder.build();
}

async function sign(pset: Lwk.Pset, index = 2) {
	const preparedPset = blindPset(lwk, wollet, new WalletCoins(coins), pset);
	return signPset(account, {
		broadcast: false,
		reviewedPset: preparedPset.toString(),
		signInputs: [{ address: "wallet-address", index, sighashTypes: [1] }],
	});
}

beforeEach(() => {
	signedSource = "";
	signerTransform = undefined;
	coins = [];
});

describe("mixed-input PSET signing", () => {
	test("rejects an unrequested signature before broadcasting", async () => {
		signerTransform = (pset) => withSignature(pset, 0);

		await expect(
			signPset(account, {
				broadcast: true,
				reviewedPset: fixture(10_000n, undefined, false).toString(),
				signInputs: [{ address: "wallet-address", index: 2, sighashTypes: [1] }],
			}),
		).rejects.toMatchObject({
			message: "Refusing to sign a Liquid PSET input the request did not list.",
		});
	});

	test("rejects replacement of an existing unrequested signature", async () => {
		const prepared = withSignature(fixture(10_000n, undefined, false), 0);
		signerTransform = (pset) => withSignature(pset, 0, 2);

		await expect(sign(prepared)).rejects.toThrow(
			"Refusing to sign a Liquid PSET input the request did not list.",
		);
	});

	test("allows requested signatures while preserving counterparty signatures", async () => {
		const prepared = withSignature(fixture(10_000n, undefined, false), 0);
		signerTransform = (pset) => withSignature(pset, 2);

		expect((await sign(prepared)).pset).toBe(withSignature(prepared, 2).toString());
	});

	test("blinds a PSET funded only by wallet coins", async () => {
		const original = fixture();
		holdFixtureInputs(original);
		const outputs = new lwk.Pset((await sign(original)).pset).extractTx().outputs;

		expect(outputs[0]!.unblind(blindingKey).value()).toBe(50_000n);
		expect(outputs[2]!.unblind(blindingKey).value()).toBe(9_000n);
		expect(outputs[3]!.isPartiallyBlinded()).toBe(false);
	});

	test("hydrates wallet coins requested by outpoint", async () => {
		const original = fixture(10_000n, undefined, true, true);
		holdFixtureInputs(original);
		const result = new lwk.Pset((await sign(original)).pset);

		expect(result.inputs()[2]!.previousScriptPubkey()?.toString()).toBe(script.toString());
		expect(result.extractTx().outputs[2]!.unblind(blindingKey).value()).toBe(9_000n);
	});

	test("replaces a dapp-supplied witness UTXO on a wallet coin", async () => {
		const original = fixture(10_000n, lwk.TxOut.fromExplicit(script, asset, 12_000n));
		holdFixtureInputs(original);
		const result = PsetMaps.parse((await sign(original)).pset);

		expect(result.inputs[2]!.explicitPrevout).toEqual({ asset: asset.toString(), value: 10_000n });
	});

	test("blinds explicit foreign inputs and preserves global metadata", async () => {
		const original = fixture();
		const originalBytes = Buffer.from(original.toString(), "base64");
		const metadata = Buffer.concat([
			Buffer.from("07fc047465737401fd0401", "hex"),
			Buffer.alloc(260, 97),
		]);
		const pset = new lwk.Pset(
			Buffer.concat([originalBytes.subarray(0, 5), metadata, originalBytes.subarray(5)]).toString(
				"base64",
			),
		);
		const result = new lwk.Pset((await sign(pset)).pset);
		const outputs = result.extractTx().outputs;
		expect(outputs[0].isPartiallyBlinded()).toBe(true);
		expect(outputs[2].isPartiallyBlinded()).toBe(true);
		expect(outputs[1].isPartiallyBlinded()).toBe(false);
		expect(outputs[3].isPartiallyBlinded()).toBe(false);
		expect(outputs[0].unblind(blindingKey).value()).toBe(50_000n);
		expect(outputs[2].unblind(blindingKey).value()).toBe(9_000n);
		expect(outputs[0].unblind(blindingKey).asset().toString()).toBe(asset.toString());
		expect(Buffer.from(result.toString(), "base64").includes(metadata)).toBe(true);
		expect(result.extractTx().toBytes().subarray(0, 4)).toEqual(
			pset.extractTx().toBytes().subarray(0, 4),
		);
		expect(
			Buffer.from(result.toString(), "base64").includes(Buffer.from("0103047b000000", "hex")),
		).toBe(true);
	});

	test("preserves an already-blinded PSET byte for byte", async () => {
		const prepared = withWitness(new lwk.Pset((await sign(fixture())).pset));
		holdFixtureInputs(prepared);
		expect((await sign(prepared)).pset).toBe(prepared.toString());
	});

	test("preserves completed blinding with zero indices on explicit outputs", async () => {
		const blinded = new lwk.Pset(
			(await sign(fixture(10_000n, undefined, true, false, undefined, 0))).pset,
		);
		const prepared = withWitness(withExplicitOutputIndices(blinded));
		signedSource = "";

		const result = await sign(prepared);
		expect(result.pset).toBe(prepared.toString());
		expect(signedSource).toBe(prepared.toString());
	});

	test("blinds genuine targets assigned to input zero with explicit-output indices", async () => {
		const original = withExplicitOutputIndices(
			fixture(10_000n, undefined, true, false, undefined, 0),
		);
		const result = new lwk.Pset((await sign(original)).pset);
		const outputs = result.extractTx().outputs;

		expect(outputs[0].unblind(blindingKey).value()).toBe(50_000n);
		expect(outputs[2].unblind(blindingKey).value()).toBe(9_000n);
		expect(outputs[1].isPartiallyBlinded()).toBe(false);
		expect(outputs[3].isPartiallyBlinded()).toBe(false);
	});

	test("preserves explicit finalized legacy PSETs without attempting blinding", async () => {
		const prepared = withWitness(withExplicitOutputIndices(fixture(10_000n, undefined, false)));
		expect((await sign(prepared)).pset).toBe(prepared.toString());
	});

	test("rejects blinding after program witnesses are finalized", async () => {
		await expect(sign(withWitness(fixture()))).rejects.toThrow(
			"PSET must be blinded before signing or finalizing its inputs.",
		);
		expect(signedSource).toBe("");
	});

	test("rejects partially completed output blinding", async () => {
		const prepared = new lwk.Pset((await sign(fixture())).pset);
		let builder = lwk.PsetBuilder.newV2();
		for (const input of prepared.inputs()) builder = builder.addInput(input);
		builder = builder.addOutput(prepared.outputs()[0]);
		for (const output of fixture().outputs().slice(1)) builder = builder.addOutput(output);
		signedSource = "";
		await expect(sign(builder.build())).rejects.toThrow(
			"Partially blinded PSETs must be completed by their original blinder.",
		);
		expect(signedSource).toBe("");
	});

	test("uses owned confidential input secrets alongside explicit foreign inputs", async () => {
		const previousOutput = new lwk.Pset((await sign(fixture())).pset).extractTx().outputs[2];
		coins = [
			holding(
				lwk.OutPoint.fromParts(new lwk.Txid("3".repeat(64)), 0),
				previousOutput,
				previousOutput.unblind(blindingKey),
			),
		];
		const result = new lwk.Pset((await sign(fixture(9_000n, previousOutput))).pset);
		expect(result.extractTx().outputs[2].unblind(blindingKey).value()).toBe(8_000n);
	});

	test("hydrates an owned confidential funding input before blinding", async () => {
		const previous = new lwk.Pset((await sign(fixture())).pset).extractTx();
		const previousOutput = previous.outputs[2];
		const outpoint = lwk.OutPoint.fromParts(previous.txid(), 2);
		coins = [holding(outpoint, previousOutput, previousOutput.unblind(blindingKey))];
		const original = fixture(9_000n, previousOutput, true, true, outpoint);
		const result = new lwk.Pset((await sign(original)).pset);
		expect(result.extractTx().outputs[2].unblind(blindingKey).value()).toBe(8_000n);
		expect(result.inputs()[2].previousScriptPubkey()?.toString()).toBe(script.toString());
		expect(
			Buffer.from(result.toString(), "base64").includes(Buffer.from("0103047b000000", "hex")),
		).toBe(true);
	});

	test("hydrates an unspent explicit wallet input", async () => {
		const result = new lwk.Pset((await sign(explicitFunding())).pset);

		expect(result.inputs()[2].previousScriptPubkey()?.toString()).toBe(script.toString());
		expect(result.extractTx().outputs[2].unblind(blindingKey).value()).toBe(9_000n);
	});

	test("does not hydrate an unconfirmed explicit wallet output", async () => {
		await expect(sign(explicitFunding(false))).rejects.toThrow(
			"Every input needs its witness UTXO before blinding.",
		);
		expect(signedSource).toBe("");
	});

	test("rejects missing witness UTXOs for unknown inputs", async () => {
		await expect(sign(fixture(10_000n, undefined, true, true))).rejects.toThrow(
			"Every input needs its witness UTXO before blinding.",
		);
		expect(signedSource).toBe("");
	});

	test("rejects foreign confidential input secrets instead of guessing", async () => {
		const previousOutput = new lwk.Pset((await sign(fixture())).pset).extractTx().outputs[2];
		signedSource = "";
		await expect(sign(fixture(9_000n, previousOutput))).rejects.toThrow(
			"Cannot blind a foreign confidential input without its blinding secrets.",
		);
		expect(signedSource).toBe("");
	});

	test("rejects an out-of-range requested index before signing", async () => {
		await expect(sign(fixture(), 3)).rejects.toThrow("Requested PSET input index is out of range.");
		expect(signedSource).toBe("");
	});
});
