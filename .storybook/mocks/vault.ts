// Storybook mock for "@/core/vault". Kept self-contained (no "@/core/vault/*"
// imports) so a simple string alias can redirect the whole module without a
// subpath conflict. `generateSeedMaterial` mirrors src/core/vault/secrets.ts.

export type VaultStatus = {
	accountCount?: number;
	hasVault: boolean;
	isUnlocked: boolean;
	keyringCount?: number;
	createdAt?: number;
	updatedAt?: number;
};

export type VaultBehavior = "success" | "error" | "pending";

export type VaultMockConfig = {
	behavior: VaultBehavior;
	errorMessage: string;
	delayMs: number;
	status: VaultStatus;
};

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

const DEFAULT_CONFIG: VaultMockConfig = {
	behavior: "success",
	errorMessage: "Incorrect password. Please try again.",
	delayMs: 350,
	status: { hasVault: true, isUnlocked: true },
};

const config: VaultMockConfig = { ...DEFAULT_CONFIG };

export function configureVaultMock(next: Partial<VaultMockConfig>) {
	Object.assign(config, next);
}

export function resetVaultMock() {
	Object.assign(config, DEFAULT_CONFIG);
}

function settle(): Promise<VaultStatus> {
	if (config.behavior === "pending") {
		// Stays pending forever so loading states remain visible in the story.
		return new Promise<VaultStatus>(() => {});
	}

	return new Promise<VaultStatus>((resolve, reject) => {
		setTimeout(() => {
			if (config.behavior === "error") {
				reject(new Error(config.errorMessage));
				return;
			}

			resolve({ ...config.status });
		}, config.delayMs);
	});
}

export function createVault(): Promise<VaultStatus> {
	return settle();
}

export function unlockVault(): Promise<VaultStatus> {
	return settle();
}

export function lockVault(): Promise<VaultStatus> {
	return settle();
}

export function resetVault(): Promise<VaultStatus> {
	return settle();
}
