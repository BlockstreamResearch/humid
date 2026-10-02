import { mock } from "bun:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { Pset } from "lwk_wasm";
import { renderToStaticMarkup } from "react-dom/server";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import { buildCoinControlPset } from "../../../../../../../../web/src/lib/pset";
import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { LiquidSigningConfirmation } from "../../../application/methods/LiquidSigningConfirmation";
import { parseLiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { parseLiquidSignPsetParams } from "../../../domain/pset/validation";
import { toLiquidAssetId } from "../../../domain/validation";
import { lwk } from "../lwkWasmForTests";
import { getWalletUtxosForAsset } from "./getUTXOs";

const require = createRequire(import.meta.url);

// This file runs only in its own subprocess. Replace the bundler URL loader, not
// wallet operations; no mock can leak into other test files in the Bun suite.
mock.module("../loadLwkWasm", () => ({ loadLwkWasm: async () => lwk }));
mock.module("../sync-worker/createSyncWorkerClient", () => ({
	getSyncWorkerClient: () => {
		throw new Error("A non-broadcast signing request must never contact the broadcaster.");
	},
}));
// Testing module boundary: install the process-local URL-loader override first.
const { preparePsetSigning } = await import("./preparePsetSigning");
const { signPset } = await import("./signPset");

const root = new URL("../../../../../../../../../", import.meta.url);
const fixture = new URL("lwk/lwk_wasm/test_data/update_with_mnemonic/", root);
// liquidjs-lib belongs to the web workspace; its PSET editor is used only to set
// the fixture's real embedded sighash, independently of the RPC allowance list.
const liquidjs = require(
	require.resolve("liquidjs-lib", {
		paths: [new URL("apps/web/", root).pathname],
	}),
) as {
	Pset: {
		fromBase64: (value: string) => {
			inputs: { sighashType?: number }[];
			toBase64: () => string;
		};
	};
};
const descriptorText = (await readFile(new URL("descriptor.txt", fixture), "utf8")).trim();
const network = lwk.Network.testnet();
const mnemonic = new lwk.Mnemonic(
	(await readFile(new URL("mnemonic.txt", fixture), "utf8")).trim(),
);
const signer = new lwk.Signer(mnemonic, network);
const descriptor = new lwk.WolletDescriptor(descriptorText);
const wollet = new lwk.Wollet(network, descriptor);
const update = lwk.Update.deserializeDecryptedBase64(
	(await readFile(new URL("update_serialized_encrypted.txt", fixture), "utf8")).trim(),
	descriptor,
);
const policyAsset = network.policyAsset();
const rawAssetId = policyAsset.toString();
const chain = parseLiquidChainRecord({
	chainGroupId: "liquid",
	id: "liquid:testnet",
	name: "Liquid Testnet",
	settings: { network: "testnet", backend: { url: "https://unused.example" } },
});
const account: LiquidWalletAccount = {
	accountIdentifier: "liquid:testnet account 0",
	chain,
	chainId: chain.id,
	descriptor: descriptorText,
	dwid: "funded-signing-fixture",
	implementation: { signer, wollet },
	policyAssetId: toLiquidAssetId(chain.id, rawAssetId),
	rawPolicyAssetId: rawAssetId,
};

function signatureCounts(pset: Pset): number[] {
	const details = wollet.psetDetails(pset);
	try {
		const inputs = details.signatures();
		try {
			return inputs.map((input) => {
				const signatures: unknown = input.hasSignature();
				assert.ok(Array.isArray(signatures));
				return signatures.length;
			});
		} finally {
			for (const input of inputs) input.free();
		}
	} finally {
		details.free();
	}
}

try {
	wollet.applyUpdate(update);
	const fee = 1000n;
	const coin = getWalletUtxosForAsset(account, rawAssetId)
		.filter((utxo) => BigInt(utxo.amount) > fee)
		.toSorted((left, right) => left.txid.localeCompare(right.txid) || left.vout - right.vout)[0];
	assert.ok(coin, "The committed funded fixture must contain a spendable policy-asset coin.");
	const addressResult = wollet.address(10);
	const destination = addressResult.address();
	let destinationAddress: string;
	try {
		destinationAddress = destination.toString();
	} finally {
		destination.free();
		addressResult.free();
	}
	const request = buildCoinControlPset({
		inputs: [coin],
		outputAmounts: [BigInt(coin.amount) - fee],
		feeSats: fee,
		destinationAddress,
		policyAssetHex: rawAssetId,
	});
	const callerPset = liquidjs.Pset.fromBase64(request.pset);
	callerPset.inputs[0].sighashType = 130;
	request.pset = callerPset.toBase64();
	const params = parseLiquidSignPsetParams(request);
	assert.deepEqual(params.signInputs[0]?.sighashTypes, [1]);
	assert.equal(params.broadcast, false);

	const skeleton = new lwk.Pset(params.pset);
	try {
		const inputs = skeleton.inputs();
		try {
			assert.equal(inputs[0]?.previousScriptPubkey(), undefined);
		} finally {
			for (const input of inputs) input.free();
		}
		// This is the old review path's missing-witness-UTXO failure, not a mock.
		skeleton.addDetails(wollet);
		assert.throws(() => {
			const details = wollet.psetDetails(skeleton);
			details.free();
		}, /witness_utxo/i);
	} finally {
		skeleton.free();
	}

	const review = await preparePsetSigning(account, params);
	assert.deepEqual(review.fees, [{ asset: rawAssetId, amount: fee.toString() }]);
	assert.deepEqual(review.netEffect, [{ asset: rawAssetId, amount: "-1000" }]);
	assert.deepEqual(review.inputs, [{ index: 0, sighashType: 130 }]);
	const markup = renderToStaticMarkup(
		<LiquidSigningConfirmation
			request={{
				title: "Sign Liquid PSET?",
				method: "signPset",
				data: {
					accountIdentifier: account.accountIdentifier,
					chainId: chain.id,
					kind: "liquid.signPset",
					broadcast: params.broadcast,
					requestedInputs: params.signInputs,
					transaction: review,
				},
			}}
			onConfirm={() => {}}
			onDecline={() => {}}
		/>,
	);
	assert.ok(markup.includes("0x82 (130)"));
	assert.ok(markup.includes("0x1"));
	assert.ok(markup.includes('role="alert"'));

	const reviewed = new lwk.Pset(review.pset);
	try {
		assert.deepEqual(signatureCounts(reviewed), [0]);
		const signed = await signPset(account, {
			broadcast: params.broadcast,
			preparedPset: review.pset,
			signInputs: params.signInputs,
		});
		assert.equal(signed.txid, undefined);
		const signedPset = new lwk.Pset(signed.pset);
		try {
			assert.deepEqual(signatureCounts(signedPset), [1]);
			const reviewedTx = reviewed.extractTx();
			const signedTx = signedPset.extractTx();
			try {
				// Exact transaction bytes include every input, output, commitment and
				// proof. Partial signatures are PSET metadata, not final witnesses.
				assert.equal(signedTx.toString(), reviewedTx.toString());
			} finally {
				signedTx.free();
				reviewedTx.free();
			}
			const inputs = signedPset.inputs();
			try {
				assert.equal(inputs[0]?.sighash(), 130);
			} finally {
				for (const input of inputs) input.free();
			}
		} finally {
			signedPset.free();
		}
		await assert.rejects(
			signPset(account, { broadcast: false, preparedPset: review.pset, signInputs: [] }),
			(error: unknown) =>
				error instanceof WalletRpcResourceUnavailableError &&
				error.data.reason === WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
		);
	} finally {
		reviewed.free();
	}
	process.stdout.write(
		`${JSON.stringify({
			fee: review.fees[0]?.amount,
			signatures: 1,
			effectiveSighash: review.inputs[0]?.sighashType,
			requestedAllowances: params.signInputs[0]?.sighashTypes,
			transactionUnchanged: true,
		})}\n`,
	);
} finally {
	policyAsset.free();
	update.free();
	wollet.free();
	descriptor.free();
	signer.free();
	mnemonic.free();
	network.free();
}
