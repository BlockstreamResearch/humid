import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk/txmanifest.json";
import type { ReadTxOut } from "../chain/chainRead";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import type { SelectableUtxo } from "./coinSelection";
import {
	isRefusal,
	type ManifestReview,
	reviewManifestAction,
	type ReviewManifestActionResult,
	type ReviewRefusal,
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
export const COVENANT_TXOUT = `01${"aa".repeat(32)}01000000000000c350000022${"00".repeat(34)}`;

export const P2PK_PATH = "./p2pk.simf";
export const P2PK_SOURCE = readFileSync(
	new URL("../__fixtures__/p2pk/p2pk.simf", import.meta.url),
	"utf8",
);
export const P2PK = p2pkManifest as unknown as Document;

export const COMPILED = {
	address: DERIVED,
	cmr: "cc".repeat(32),
	scriptPubKeyHex: DERIVED_SCRIPT,
	tapleafHash: "1e".repeat(32),
};

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
		txOutHex: COVENANT_TXOUT,
	});
}

export function dependencies(overrides: Partial<ReviewDependencies> = {}): ReviewDependencies {
	return {
		accountLabel: ACCOUNT,
		compile: () => COMPILED,
		fundingUtxos: [utxo("1000000")],
		network: "liquid",
		policyAsset: POLICY_ASSET,
		readFeeRate: async () => 1000,
		readTxOut: chainHolding(),
		scriptPubKeyOf: () => DERIVED_SCRIPT,
		walletScriptPubKeyHex: WALLET_SCRIPT,
		...overrides,
	};
}

export function payRequest(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: { [P2PK_PATH]: P2PK_SOURCE },
		manifest: P2PK,
		params: { amount_sat: 1000, pubkey: PUBKEY },
		...overrides,
	};
}

export function receiveRequest(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return payRequest({
		action: "Receive",
		params: { pubkey: PUBKEY },
		state: { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] },
		...overrides,
	});
}

export function edited(document: Document, edit: (copy: Document) => void): Document {
	const copy = structuredClone(document);

	edit(copy);

	return copy;
}

export function actionOf(document: Document, name: string): Document {
	return (document.actions as Record<string, Document>)[name] ?? {};
}

export function editedAction(name: string, edit: (action: Document) => void, document = P2PK) {
	return edited(document, (copy) => edit(actionOf(copy, name)));
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
