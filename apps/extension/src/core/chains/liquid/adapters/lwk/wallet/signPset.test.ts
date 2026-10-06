import { expect, mock, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { WALLET_RPC_ERROR_REASONS } from "@/core/wallet-rpc/errors";

import { buildCoinControlPset } from "../../../../../../../../web/src/lib/pset";
import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { parseLiquidSignPsetParams } from "../../../domain/pset/validation";
import { lwk } from "../lwkWasmForTests";
import { getWalletUtxosForAsset } from "./getUTXOs";

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
	const fixture = new URL("lwk/lwk_wasm/test_data/update_with_mnemonic/", root);
	const text = async (name: string) => (await readFile(new URL(name, fixture), "utf8")).trim();
	const require = createRequire(import.meta.url);
	const liquidjs = require(
		require.resolve("liquidjs-lib", { paths: [new URL("apps/web/", root).pathname] }),
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
		const params = parseLiquidSignPsetParams({ ...request, pset: callerPset.toBase64() });
		const review = await blindAndInspectPset(account, params.pset);
		expect(review.fees).toEqual([{ asset: rawAssetId, amount: "1000" }]);
		expect(review.netEffect).toEqual([{ asset: rawAssetId, amount: "-1000" }]);
		expect(review.inputs).toEqual([{ index: 0, sighashType: 130 }]);
		expect(params.signInputs[0]!.sighashTypes).toEqual([1]);
		const reviewed = own(new lwk.Pset(review.pset));
		const before = own(wollet.psetDetails(reviewed)).signatures();
		before.forEach(own);
		expect(before.map((input) => input.hasSignature().length)).toEqual([0]);
		const signing = { broadcast: false, reviewedPset: review.pset, signInputs: params.signInputs };
		const signed = await signPset(account, signing);
		expect(signed.txid).toBeUndefined();
		const signedPset = own(new lwk.Pset(signed.pset));
		const after = own(wollet.psetDetails(signedPset)).signatures();
		after.forEach(own);
		expect(after.map((input) => input.hasSignature().length)).toEqual([1]);
		expect(own(signedPset.extractTx()).toString()).toBe(own(reviewed.extractTx()).toString());
		expect(signedPset.inputs().map((input) => own(input).sighash())).toEqual([130]);
		await expect(signPset(account, { ...signing, signInputs: [] })).rejects.toMatchObject({
			data: { reason: WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST },
		});
		await expect(
			signPset(account, { ...signing, signInputs: [{ ...params.signInputs[0]!, index: 1 }] }),
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
	const child = Bun.spawn([process.execPath, "test", fileURLToPath(import.meta.url)], {
		cwd: fileURLToPath(new URL("../../../../../../../../../", import.meta.url)),
		env: { ...process.env, LWK_SIGNING_CHILD: "1" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect(exitCode, stdout + stderr).toBe(0);
}, 30_000);
