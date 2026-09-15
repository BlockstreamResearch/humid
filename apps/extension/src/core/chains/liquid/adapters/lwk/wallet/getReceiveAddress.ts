import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";

/** The one index the contract path signs at, as `readExplicitWalletUtxos` states. */
const SIGNING_ADDRESS_INDEX = 0;

/**
 * The wallet's current receive address — the last unused address (index 0 for a
 * fresh, unsynced wallet). Deriving it needs no network sync.
 */
export function getWalletReceiveAddress(account: LiquidWalletAccount): {
	address: string;
	index: number;
} {
	const implementation = getLwkImplementation(account);
	const result = implementation.wollet.address();

	return { address: result.address().toString(), index: result.index() };
}

/**
 * The address a contract action can spend from: the account's first external address.
 *
 * Fixed rather than rotating, and deliberately so — `readExplicitWalletUtxos` accepts only
 * outputs at this index, because the signing module derives one key there. Handing a protocol's
 * token back to a rotating address makes it unspendable by the same path that received it.
 */
export function getWalletSigningAddress(account: LiquidWalletAccount): {
	address: string;
	index: number;
} {
	const implementation = getLwkImplementation(account);
	const result = implementation.wollet.address(SIGNING_ADDRESS_INDEX);

	return { address: result.address().toString(), index: result.index() };
}
