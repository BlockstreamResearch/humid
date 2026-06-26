const GENERATED_SECRET_BYTES = 32;

export function generateSecret(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_SECRET_BYTES));
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
