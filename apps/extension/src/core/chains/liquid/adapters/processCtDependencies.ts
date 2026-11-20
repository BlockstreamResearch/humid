import { createEsploraFeeRateReader, createEsploraTxOutReader } from "@humid/tx-manifest";

import { resolveDappAccount } from "../application/dappAccountScope";
import type { LiquidProcessCtDependencies } from "../application/methods/processConfidentialTransaction";
import { createLwkNetwork } from "./lwk/createLwkNetwork";
import { loadLwkWasm } from "./lwk/loadLwkWasm";
import { addressReader } from "./lwk/wallet/readAddress";
import { sentTransactions } from "./lwk/wallet/sentTransactions";
import { walletKeyOf } from "./lwk/wallet/walletKey";
import { walletUnblinder } from "./lwk/wallet/walletUnblinder";
import { withAccountMnemonic } from "./lwk/wallet/withAccountMnemonic";
import { smplxContractTools } from "./smplx/smplxContractTools";

export const processCtDependencies: LiquidProcessCtDependencies = {
	broadcastTransaction: (account, txHex, note) => sentTransactions.broadcast(account, txHex, note),
	contractTools: smplxContractTools(),
	readAddress: async (chain) => {
		const lwk = await loadLwkWasm();

		return addressReader(lwk, createLwkNetwork(lwk, chain));
	},
	readFeeRate: (chain) => createEsploraFeeRateReader(chain.settings.backend),
	readTxOut: (chain) => createEsploraTxOutReader(chain.settings.backend),
	rememberTransaction: (account, txHex, signedFor) =>
		sentTransactions.remember(account, txHex, signedFor),
	resolveAccount: resolveDappAccount,
	unblinder: async (account, scriptPubKeyHex) =>
		walletUnblinder(await loadLwkWasm(), account.descriptor, scriptPubKeyHex),
	walletKeyOf,
	withMnemonic: withAccountMnemonic,
};
