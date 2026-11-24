import { afterAll, expect, mock, setSystemTime, test } from "bun:test";

const areas = { local: new Map<string, unknown>(), session: new Map<string, unknown>() };

const storageArea = (area: Map<string, unknown>) => ({
	get: async (key: string | null) =>
		key === null ? Object.fromEntries(area) : area.has(key) ? { [key]: area.get(key) } : {},
	remove: async (keys: string | string[]) => {
		for (const key of [keys].flat()) area.delete(key);
	},
	set: async (items: Record<string, unknown>) => {
		for (const [key, value] of Object.entries(items)) area.set(key, structuredClone(value));
	},
});

mock.module("webextension-polyfill", () => ({
	default: { storage: { local: storageArea(areas.local), session: storageArea(areas.session) } },
}));

const records = await import("./records");

mock.module("./records", () => ({
	...records,
	SECURE_VAULT_KDF: { ...records.SECURE_VAULT_KDF, iterations: 1_000 },
}));

const vault = await import("./index");

const PASSWORD = "correct horse";

afterAll(() => setSystemTime());

test("a wallet is never created with a password shorter than the policy allows", async () => {
	await expect(vault.createSecureVault({ passphrase: "short" })).rejects.toThrow(
		"at least 8 characters",
	);
	expect((await vault.getSecureVaultStatus()).hasVault).toBe(false);

	await vault.createSecureVault({ passphrase: PASSWORD });
	await vault.lockSecureVault();
});

test("a sensitive action proves the password without unlocking anything", async () => {
	await expect(vault.verifySecureVaultPassphrase("wrong password")).rejects.toThrow(
		"Wrong password",
	);
	await vault.verifySecureVaultPassphrase(PASSWORD);

	expect((await vault.getSecureVaultStatus()).isUnlocked).toBe(false);
});

test("guesses sent all at once still count one by one, and the pause outlives the worker", async () => {
	const guesses = await Promise.allSettled(
		Array.from({ length: 7 }, () => vault.unlockSecureVault({ passphrase: "wrong password" })),
	);
	const reasons = guesses.map((guess) =>
		guess.status === "rejected" ? String((guess.reason as Error).message) : "unlocked",
	);

	expect(reasons.slice(0, 4).every((reason) => reason.startsWith("Wrong password"))).toBe(true);
	expect(reasons.slice(4).every((reason) => reason.startsWith("Too many"))).toBe(true);
	expect(areas.local.get("secure-vault:unlock-throttle")).toMatchObject({ failed: 5 });

	await expect(vault.unlockSecureVault({ passphrase: PASSWORD })).rejects.toThrow("Too many");

	setSystemTime(new Date(Date.now() + 31_000));

	await vault.unlockSecureVault({ passphrase: PASSWORD });

	expect((await vault.getSecureVaultStatus()).isUnlocked).toBe(true);
	expect(areas.local.has("secure-vault:unlock-throttle")).toBe(false);
});
