import type { KeySourceId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { KeyManagerState } from "@/core/key-manager/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { createLwkMnemonicFromSeedMaterial } from "../createLwkMnemonic";
import { createLwkNetwork } from "../createLwkNetwork";
import { getLocalRootSeedMaterial, getSeedMaterialForKeySource } from "../getLocalRootSeedMaterial";
import { loadLwkWasm } from "../loadLwkWasm";

export type AccountMnemonicRequest = {
	accountGroupIndex?: number;
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	keySourceId?: KeySourceId;
};

/**
 * Runs `use` with the account's BIP-39 mnemonic, and takes it away again afterwards.
 *
 * The mnemonic is the whole account secret. It exists here only for the duration of one
 * call, in one place, and every wasm object that held it on the way is freed before this
 * returns — including when `use` throws. Nothing is cached and nothing is returned, so
 * there is no handle a later caller could reach it through.
 *
 * The derivation is LWK's, unchanged from how accounts are resolved everywhere else:
 * group 0 is the master seed's own mnemonic; group N derives a BIP-85 child at index N.
 * Duplicating that math here rather than reusing it would be a second place for the
 * account model to drift.
 *
 * Why this exists at all: smplx signs and blinds from one source, and blinding derives
 * from SLIP77 material an extended private key does not carry. Handing over the mnemonic
 * is the accepted debt recorded in this change's specification, not a shortcut — and the
 * conditions that should reopen it are recorded there too.
 */
export async function withAccountMnemonic<T>(
	request: AccountMnemonicRequest,
	use: (mnemonic: string) => Promise<T> | T,
): Promise<T> {
	const seedMaterial = request.keySourceId
		? getSeedMaterialForKeySource(request.keyManagerState, request.keySourceId)
		: getLocalRootSeedMaterial(request.keyManagerState);

	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, request.chain);
	const masterMnemonic = createLwkMnemonicFromSeedMaterial(lwk, seedMaterial);

	let masterSigner: ReturnType<typeof buildSigner> | undefined;
	let accountMnemonic: InstanceType<typeof lwk.Mnemonic> | undefined;

	function buildSigner() {
		return new lwk.Signer(masterMnemonic, network);
	}

	try {
		masterSigner = buildSigner();

		const accountGroupIndex = request.accountGroupIndex ?? 0;

		accountMnemonic =
			accountGroupIndex === 0
				? masterMnemonic
				: masterSigner.derive_bip85_mnemonic(accountGroupIndex, 12);

		return await use(accountMnemonic.toString());
	} finally {
		masterSigner?.free();

		if (accountMnemonic && accountMnemonic !== masterMnemonic) {
			accountMnemonic.free();
		}

		masterMnemonic.free();
		network.free();
	}
}
