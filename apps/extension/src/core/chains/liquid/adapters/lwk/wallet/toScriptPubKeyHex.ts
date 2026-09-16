import { loadLwkWasm } from "../loadLwkWasm";

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
