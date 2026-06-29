const GENERATED_SEED_MATERIAL_BYTES = 32;

export function generateSeedMaterial(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_SEED_MATERIAL_BYTES));
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export const generateSecret = generateSeedMaterial;
