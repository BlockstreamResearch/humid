import { AccountRegistry, type AccountRegistryInput } from "./AccountRegistry";

export function createAccountRegistry(input: AccountRegistryInput = {}) {
	return new AccountRegistry(input);
}
