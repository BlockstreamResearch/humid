import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";

const SIGNING_ADDRESS_INDEX = 0;

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
	unconfidential: string;
} {
	const implementation = getLwkImplementation(account);
	const result = implementation.wollet.address(SIGNING_ADDRESS_INDEX);
	const address = result.address();

	return {
		address: address.toString(),
		index: result.index(),
		unconfidential: address.toUnconfidential().toString(),
	};
}
