import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";

const SIGNING_ADDRESS_INDEX = 0;

export function getWalletAddress(
	account: LiquidWalletAccount,
	index: number,
): { address: string; explicit: string } {
	const result = getLwkImplementation(account).wollet.address(index);
	const address = result.address();

	return { address: address.toString(), explicit: address.toUnconfidential().toString() };
}

export function getWalletReceiveAddress(account: LiquidWalletAccount): {
	address: string;
	index: number;
} {
	const implementation = getLwkImplementation(account);
	const result = implementation.wollet.address();

	return { address: result.address().toString(), index: result.index() };
}

export function getWalletSigningAddress(account: LiquidWalletAccount): {
	address: string;
	index: number;
	explicit: string;
} {
	const implementation = getLwkImplementation(account);
	const result = implementation.wollet.address(SIGNING_ADDRESS_INDEX);
	const address = result.address();

	return {
		address: address.toString(),
		index: result.index(),
		explicit: address.toUnconfidential().toString(),
	};
}
