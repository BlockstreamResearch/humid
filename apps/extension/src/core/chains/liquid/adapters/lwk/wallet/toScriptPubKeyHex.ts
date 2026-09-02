import { loadLwkWasm } from "../loadLwkWasm";

/**
 * The scriptPubKey an address pays to, as lowercase hex.
 *
 * Exists so a caller that needs a wallet output's script does not have to reach for key
 * material to get it. An address is public; deriving a script from one should not require
 * touching a seed, and this is what keeps that true.
 */
export async function toScriptPubKeyHex(address: string): Promise<string> {
	const lwk = await loadLwkWasm();
	const parsed = new lwk.Address(address);

	try {
		const script = parsed.scriptPubkey();

		try {
			return script.toString();
		} finally {
			script.free();
		}
	} finally {
		parsed.free();
	}
}
