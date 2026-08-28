import type { KeyManagerState } from "@/core/key-manager/types";

import { withAccountMnemonic } from "../adapters/lwk/wallet/withAccountMnemonic";
import { loadSmplxWasm } from "../adapters/smplx/loadSmplxWasm";
import type { LiquidChainRecord } from "../chains/LiquidChainRecord";

/** The network names the SDK understands, keyed by the wallet's own network kind. */
const SMPLX_NETWORKS: Record<string, string> = {
	mainnet: "liquid",
	regtest: "elements-regtest",
	testnet: "liquid-testnet",
};

/**
 * The one identity a contract action is signed with.
 *
 * This is not the wallet's own address and is not interchangeable with it. A contract
 * action can be funded only from the unblinded output at this one address, and change
 * returns here rather than to a wallet change address.
 *
 * **The limit is this wallet's, not the signing module's.** An earlier version of this
 * comment blamed the module, and the module's author said so on review. It takes a change
 * target and a derivation path per input; this wallet supplies one change script — the
 * signer's own — and no paths at all, so every wallet input is signed with the key at
 * `m/84h/{1|1776}h/0h/0/0` because that is the default nothing here overrides. Lifting the
 * limit is work in this method, not in the module.
 *
 * Both values are read-only and public: an address anyone can pay, and the x-only form
 * of the same key. Nothing here returns a secret.
 */
export type LiquidContractIdentity = {
	/** The unblinded address contract actions can be funded from, and where change returns. */
	address: string;
	/** The x-only public key a covenant locking to "the wallet's key" is parameterised with. */
	schnorrPublicKey: string;
};

export type ReadLiquidContractIdentityInput = {
	accountGroupIndex: number;
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
};

/**
 * Reads the address and key that contract actions are signed with.
 *
 * It exists because neither value was reachable from anywhere: the wallet's own screens
 * show lwk's confidential addresses across a ranged descriptor, and no method returned
 * the signing key — so funding a contract action meant guessing an address, and locking
 * a covenant to this wallet meant guessing a key. Both guesses fail late, one of them
 * by making funds unspendable.
 *
 * Showing them is a narrower answer than the one this eventually needs, which is for the
 * module to sign each input at its own derivation path and take a change address from
 * the wallet (DISC-053). Until that lands, the limit is real and this makes it visible
 * rather than hidden.
 */
export async function readLiquidContractIdentity(
	{ accountGroupIndex, chain, keyManagerState }: ReadLiquidContractIdentityInput,
	dependencies = { loadSmplx: loadSmplxWasm, withMnemonic: withAccountMnemonic },
): Promise<LiquidContractIdentity> {
	const network = SMPLX_NETWORKS[chain.settings.network];

	if (!network) {
		throw new Error(`The contract SDK does not support the ${chain.settings.network} network.`);
	}

	const smplx = await dependencies.loadSmplx();

	return dependencies.withMnemonic(
		{ accountGroupIndex, chain, keyManagerState },
		(mnemonic: string) => {
			const signer = new smplx.WalletSigner(mnemonic, network);

			try {
				return { address: signer.address(), schnorrPublicKey: signer.schnorrPublicKey() };
			} finally {
				signer.free();
			}
		},
	);
}
