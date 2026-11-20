import type { Pset, Wollet } from "lwk_wasm";

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
		return inspectPset(lwk, wollet, coins, blindedPset);
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
		const review = markOwnership(lwk, wollet, pset);
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
		const balance = own(own(wollet.psetDetails(own(new lwk.Pset(review.toString())))).balance());
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
			outputs: outputs.map((output, index) => {
				const value = output.asset();
				const asset = value ? own(value) : undefined;
				return {
					address: addresses.get(index),
					amount: output.amount()?.toString(),
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
		pset = new lwk.Pset(params.reviewedPset);
		const signaturesBefore = readInputSignatures(pset);
		const inputCount = signaturesBefore.length;

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

		const requestedIndexes = new Set(params.signInputs.map((requested) => requested.index));

		// sign and finalize consume their input, including when they throw.
		const signingPset = pset;
		pset = undefined;
		// The review shows each input's sighash, so dapp-chosen ones are signed as shown.
		const options = lwk.SignOptions.dangerousAllowAnySighash();
		try {
			pset = implementation.signer.signWithOptions(signingPset, options);
		} finally {
			options.free();
		}

		const overSignedInputIndex = readInputSignatures(pset).findIndex(
			(signatures, index) =>
				!requestedIndexes.has(index) &&
				[...signatures].some(([key, value]) => !signaturesBefore[index].get(key)?.equals(value)),
		);
		if (overSignedInputIndex !== -1) {
			throw new WalletRpcResourceUnavailableError(
				"The wallet refused to sign an input the dapp did not list.",
				{
					overSignedInputIndex,
					requestedInputIndexes: [...requestedIndexes],
				},
				WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
			);
		}

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

		console.error("[liquid] signPset failed", error);

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

function readInputSignatures(pset: Pset) {
	return PsetMaps.parse(pset.toString()).inputs.map((input) => input.signatures);
}

function markOwnership(lwk: LwkWasmModule, wollet: Wollet, pset: Pset): PsetMaps {
	const maps = PsetMaps.parse(pset.toString());
	for (const entries of [...maps.inputs, ...maps.outputs]) entries.disown();
	const marked = new lwk.Pset(maps.toString());
	try {
		marked.addDetails(wollet);
		return PsetMaps.parse(marked.toString());
	} finally {
		marked.free();
	}
}
