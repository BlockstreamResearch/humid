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
