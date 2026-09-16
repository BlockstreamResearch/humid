import type { KeySourceId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { KeyManagerState } from "@/core/key-manager/types";

import { withAccountMnemonic } from "../adapters/lwk/wallet/withAccountMnemonic";
import { loadSmplxWasm } from "../adapters/smplx/loadSmplxWasm";
import type { LiquidChainRecord } from "../chains/LiquidChainRecord";

const SMPLX_NETWORKS: Record<string, string> = {
	mainnet: "liquid",
	regtest: "elements-regtest",
	testnet: "liquid-testnet",
};

export type LiquidContractIdentity = {
	address: string;
	schnorrPublicKey: string;
};

export type ReadLiquidContractIdentityInput = {
	accountGroupIndex: number;
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	keySourceId?: KeySourceId;
};

export async function readLiquidContractIdentity(
	{ accountGroupIndex, chain, keyManagerState, keySourceId }: ReadLiquidContractIdentityInput,
	dependencies = { loadSmplx: loadSmplxWasm, withMnemonic: withAccountMnemonic },
): Promise<LiquidContractIdentity> {
	const network = SMPLX_NETWORKS[chain.settings.network];

	if (!network) {
		throw new Error(`The contract SDK does not support the ${chain.settings.network} network.`);
	}

	const smplx = await dependencies.loadSmplx();

	return dependencies.withMnemonic(
		{
			accountGroupIndex,
			chain,
			keyManagerState,
			...(keySourceId === undefined ? {} : { keySourceId }),
		},
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
