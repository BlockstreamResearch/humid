import type { Pset, Wollet } from "lwk_wasm";

import { logger } from "@/core/logger";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type {
	LiquidWalletAccount,
	LiquidWalletBackend,
} from "../../../application/backends/LiquidWalletBackend";
import type { LiquidSignPsetReview } from "../../../domain/pset/types";
import { type LwkWasmModule, loadLwkWasm } from "../loadLwkWasm";
import { blindPset } from "./blindPset";
import { getLwkImplementation } from "./getLwkImplementation";
import { invalidPset, PsetMaps } from "./PsetMaps";
import { sentTransactions } from "./sentTransactions";
import { WalletCoins } from "./WalletCoins";

const SIGHASH_ALL = 1;

export async function blindAndInspectPset(
	account: LiquidWalletAccount,
	psetBase64: string,
): Promise<LiquidSignPsetReview> {
	const lwk = await loadLwkWasm();
	const { wollet } = getLwkImplementation(account);
	const coins = WalletCoins.of(wollet);
	const pset = new lwk.Pset(psetBase64);
	let blindedPset: Pset | undefined;
	try {
		pset.addDetails(wollet);
		blindedPset = blindPset(lwk, wollet, coins, pset);
		// An output the dapp sent explicit keeps true values, or the wallet blinded those values itself.
		const verifiable = PsetMaps.parse(psetBase64).outputs.map((output) => output.isExplicit);
		return inspectPset(lwk, wollet, coins, blindedPset, verifiable);
	} finally {
		if (blindedPset !== pset) blindedPset?.free();
		pset.free();
	}
}

function inspectPset(
	lwk: LwkWasmModule,
	wollet: Wollet,
	coins: WalletCoins,
	pset: Pset,
	verifiable: boolean[],
): LiquidSignPsetReview {
	const resources: { free(): void }[] = [];
	const own = <T extends { free(): void }>(value: T): T => {
		resources.push(value);
		return value;
	};
	try {
		const inputs = pset.inputs();
		inputs.forEach(own);
		const outputs = pset.outputs();
		outputs.forEach(own);
		const explicitBalances = new Map<string, bigint>();
		const add = (asset: string, amount: bigint) => {
			explicitBalances.set(asset, (explicitBalances.get(asset) ?? 0n) + amount);
		};
		const review = markOwnership(lwk, wollet, pset.toString());
		const ownedOutputs = review.outputs.map((output) => output.isOwned);
		const spent = review.inputs.map((input) => {
			if (!input.isOwned) {
				const prevout = input.explicitPrevout;
				return { amount: prevout?.value.toString(), asset: prevout?.asset, owned: false };
			}
			const coin = coins.find(input.outpoint);
			if (!coin) throw invalidPset("PSET spends a wallet output the wallet does not hold.");
			add(coin.rawAssetId, -BigInt(coin.amountSats));
			input.disown();
			return { amount: coin.amountSats, asset: coin.rawAssetId, owned: true };
		});
		for (const [index, output] of review.outputs.entries()) {
			if (!output.isOwned || !output.isExplicit) continue;
			const amount = outputs[index]!.amount();
			const asset = outputs[index]!.asset();
			if (amount === undefined || !asset) throw invalidPset("PSET output lacks its amount.");
			add(own(asset).toString(), amount);
			output.disown();
		}
		const details = own(wollet.psetDetails(own(new lwk.Pset(review.toString()))));
		const balance = own(details.balance());
		const issuances = details.inputsIssuances();
		issuances.forEach(own);
		const fees = own(balance.fees());
		const netBalances = new Map(own(balance.balances()).entries() as Map<string, bigint>);
		for (const [asset, amount] of explicitBalances) {
			netBalances.set(asset, (netBalances.get(asset) ?? 0n) + amount);
		}
		const addresses = new Map<number, string>();
		const recipients = balance.recipients();
		recipients.forEach(own);
		for (const recipient of recipients) {
			const address = recipient.address();
			if (address) addresses.set(recipient.vout(), own(address).toString());
		}
		return {
			pset: pset.toString(),
			inputs: inputs.map((input, index) => ({
				...spent[index]!,
				index,
				sighashType: input.sighash() ?? SIGHASH_ALL,
			})),
			fees: Array.from(fees.entries() as Map<string, bigint>, ([asset, amount]) => ({
				asset,
				amount: amount.toString(),
			})),
			netEffect: Array.from(netBalances, ([asset, amount]) => ({
				asset,
				amount: amount.toString(),
			})).filter((entry) => entry.amount !== "0"),
			issuances: issuances.flatMap((issuance, index) => {
				const asset = issuance.asset();
				const token = issuance.token();
				if (!asset || !(issuance.isIssuance() || issuance.isReissuance())) return [];
				const issued = review.inputs[index]!.issued;
				return [
					{
						amount: issued.amount?.toString(),
						asset: own(asset).toString(),
						index,
						kind: issuance.isReissuance() ? ("reissuance" as const) : ("issuance" as const),
						token: token ? own(token).toString() : undefined,
						tokenAmount: issued.tokens?.toString(),
					},
				];
			}),
			outputs: outputs.map((output, index) => {
				const verified = verifiable[index] === true;
				const value = verified ? output.asset() : undefined;
				const asset = value ? own(value) : undefined;
				return {
					address: addresses.get(index),
					amount: verified ? output.amount()?.toString() : undefined,
					asset: asset?.toString(),
					index,
					owned: ownedOutputs[index]!,
					script: own(output.scriptPubkey()).toString(),
				};
			}),
		};
	} finally {
		for (let i = resources.length - 1; i >= 0; i--) resources[i]!.free();
	}
}

export async function signPset(
	account: LiquidWalletAccount,
	params: Parameters<LiquidWalletBackend["signPset"]>[1],
	signedFor: Parameters<LiquidWalletBackend["signPset"]>[2],
) {
	const implementation = getLwkImplementation(account);
	let pset: Pset | undefined;
	try {
		const lwk = await loadLwkWasm();
		const reviewed = PsetMaps.parse(params.reviewedPset);
		const inputCount = reviewed.inputs.length;

		if (params.signInputs.length === 0) {
			throw invalidPset("The dapp listed no inputs to sign.");
		}

		for (const input of params.signInputs) {
			if (input.index >= inputCount) {
				throw new WalletRpcResourceUnavailableError(
					"The dapp asked to sign an input the transaction does not have.",
					{
						inputCount,
						requestedIndex: input.index,
					},
					WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
				);
			}
		}

		// The signer sees only the key paths the wallet adds itself, never ones the dapp wrote.
		const signing = new lwk.Pset(
			markOwnership(lwk, implementation.wollet, params.reviewedPset).toString(),
		);
		// The review refused every sighash the dapp did not declare, so each one left was shown and declared.
		const options = lwk.SignOptions.dangerousAllowAnySighash();
		let signed: Pset;
		try {
			// sign consumes its input, including when it throws.
			signed = implementation.signer.signWithOptions(signing, options);
		} finally {
			options.free();
		}

		const signatures = PsetMaps.parse(signed.toString());
		signed.free();

		for (const { index } of params.signInputs) {
			const input = reviewed.inputs[index]!;

			input.adoptSignatures(signatures.inputs[index]!);

			if (input.signatures.size === 0) {
				throw new WalletRpcResourceUnavailableError(
					`The wallet cannot sign the input at index ${index}.`,
					{ requestedIndex: index },
					WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
				);
			}
		}

		pset = new lwk.Pset(reviewed.toString());

		let txid: string | undefined;

		if (params.broadcast) {
			const finalizingPset = pset;
			pset = undefined;
			pset = implementation.wollet.finalize(finalizingPset);
			txid = await sentTransactions.broadcast(account, pset.extractTx().toString(), signedFor);
		} else {
			await sentTransactions.remember(account, pset.extractTx().toString(), signedFor);
		}

		return {
			pset: pset.toString(),
			txid,
		};
	} catch (error) {
		if (error instanceof WalletRpcResourceUnavailableError) {
			throw error;
		}

		logger.error("[liquid] signPset failed", error);

		const failure = new WalletRpcResourceUnavailableError(
			params.broadcast
				? "Could not sign and broadcast the transaction."
				: "Could not sign the transaction.",
			undefined,
			params.broadcast
				? WALLET_RPC_ERROR_REASONS.WALLET_PSET_BROADCAST_FAILED
				: WALLET_RPC_ERROR_REASONS.WALLET_PSET_SIGNING_FAILED,
		);
		failure.cause = error;
		throw failure;
	} finally {
		pset?.free();
	}
}

function markOwnership(lwk: LwkWasmModule, wollet: Wollet, psetBase64: string): PsetMaps {
	const maps = PsetMaps.parse(psetBase64);
	for (const entries of [...maps.inputs, ...maps.outputs]) entries.disown();
	const marked = new lwk.Pset(maps.toString());
	try {
		marked.addDetails(wollet);
		return PsetMaps.parse(marked.toString());
	} finally {
		marked.free();
	}
}
