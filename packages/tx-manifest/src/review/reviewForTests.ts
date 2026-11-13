import { readdirSync, readFileSync } from "node:fs";

import type { ReadTxOut } from "../chain/chainRead";
import { Refusal } from "../refusal";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import type { SelectableUtxo } from "./coinSelection";
import {
	isRefusal,
	type ManifestReview,
	reviewManifestAction,
	type ReviewManifestActionResult,
	type ReviewRefusal,
	type TransactionDraft,
} from "./index";

export type ReviewDependencies = Parameters<typeof reviewManifestAction>[1];
export type Document = Record<string, unknown>;

export const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
export const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
export const ACCOUNT = "liquid:testnet account 0";
export const TXID = "b".repeat(64);
export const FUNDING_TXID = "c".repeat(64);

export const DERIVED = "tex1p_derived";
export const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
export const ELSEWHERE_SCRIPT = `5120${"22".repeat(32)}`;
export const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
export const WALLET_ADDRESS = "tex1q_wallet";
export const PROGRAM_TXOUT = `01${"aa".repeat(32)}01000000000000c350000022${"00".repeat(34)}`;

export const COMPILED = {
	address: DERIVED,
	cmr: "cc".repeat(32),
	scriptPubKeyHex: DERIVED_SCRIPT,
	tapleafHash: "1e".repeat(32),
};

export class Fixture {
	private constructor(
		readonly manifest: Document,
		readonly contractSources: Record<string, string>,
	) {}

	static load(name: string): Fixture {
		const at = new URL(`../__fixtures__/${name}/`, import.meta.url);
		const read = (file: string) => readFileSync(new URL(file, at), "utf8");

		return new Fixture(
			JSON.parse(read("txmanifest.json")),
			Object.fromEntries(
				readdirSync(at)
					.filter((file) => file.endsWith(".simf"))
					.map((file) => [`./${file}`, read(file)]),
			),
		);
	}

	action(name: string): Document {
		return structuredClone((this.manifest.actions as Record<string, Document>)[name] ?? {});
	}

	source(path: string): string {
		return this.contractSources[path] ?? "";
	}

	edited(edit: (manifest: Document) => void): Fixture {
		const manifest = structuredClone(this.manifest);

		edit(manifest);

		return new Fixture(manifest, this.contractSources);
	}

	editedAction(name: string, edit: (action: Document) => void): Fixture {
		return this.edited((manifest) => edit((manifest.actions as Record<string, Document>)[name]!));
	}

	request(
		action: string,
		overrides: Partial<ParsedLiquidProcessCtParams> = {},
	): ParsedLiquidProcessCtParams {
		return {
			action,
			broadcast: false,
			contractSources: this.contractSources,
			manifest: this.manifest,
			params: {},
			...overrides,
		};
	}
}

export function utxo(
	amount: string,
	txid = FUNDING_TXID,
	overrides: Partial<SelectableUtxo> = {},
): SelectableUtxo {
	return { amount, spendable: true, txOut: "00", txid, vout: 0, ...overrides };
}

export function chainHolding(scriptPubKeyHex = DERIVED_SCRIPT, amountSats = "50000"): ReadTxOut {
	return async () => ({
		amountSats,
		rawAssetId: POLICY_ASSET,
		scriptPubKeyHex,
		txOutHex: PROGRAM_TXOUT,
	});
}

export function sizedFee(draft: TransactionDraft, feeRateSatsPerKvb: number): bigint {
	const vsize = 100 + 100 * draft.inputOrder.length + 50 * draft.outputs.length;

	return BigInt(Math.ceil((vsize * feeRateSatsPerKvb) / 1000));
}

export function dependencies(overrides: Partial<ReviewDependencies> = {}): ReviewDependencies {
	return {
		accountLabel: ACCOUNT,
		compile: () => COMPILED,
		estimateFee: sizedFee,
		fundingUtxos: [utxo("1000000")],
		network: "liquid",
		policyAsset: POLICY_ASSET,
		readAddress: (address) => ({ scriptPubKeyHex: address }),
		readFeeRate: async () => 1000,
		readTxOut: chainHolding(),
		scriptPubKeyOf: () => DERIVED_SCRIPT,
		walletAddress: WALLET_ADDRESS,
		walletKey: PUBKEY,
		walletScriptPubKeyHex: WALLET_SCRIPT,
		...overrides,
	};
}

export function review(
	request: ParsedLiquidProcessCtParams,
	overrides: Partial<ReviewDependencies> = {},
): Promise<ReviewManifestActionResult> {
	return reviewManifestAction(request, dependencies(overrides));
}

export function asReview(result: ReviewManifestActionResult): ManifestReview {
	if (isRefusal(result)) {
		throw new Error(`Refused (${result.reject}): ${result.reason}`);
	}

	return result;
}

export function asRefusal(result: ReviewManifestActionResult): ReviewRefusal {
	if (!isRefusal(result)) {
		throw new Error("Reviewed where a refusal was expected.");
	}

	return result;
}

export async function reviewed(
	request: ParsedLiquidProcessCtParams,
	overrides: Partial<ReviewDependencies> = {},
): Promise<ManifestReview> {
	return asReview(await review(request, overrides));
}

export async function refused(
	request: ParsedLiquidProcessCtParams,
	overrides: Partial<ReviewDependencies> = {},
): Promise<ReviewRefusal> {
	return asRefusal(await review(request, overrides));
}

export function refusalOf(run: () => unknown): Refusal {
	try {
		run();
	} catch (error) {
		if (error instanceof Refusal) {
			return error;
		}

		throw error;
	}

	throw new Error("Ran where a refusal was expected.");
}
