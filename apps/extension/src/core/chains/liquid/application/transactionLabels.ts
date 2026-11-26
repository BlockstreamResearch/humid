import { createSecureJsonStore } from "@/core/secure-vault/json-store/createSecureJsonStore";

import type { TransactionNote } from "./signedHold";

type Labels = Record<string, TransactionNote>;

const store = createSecureJsonStore<Labels>({
	key: "liquid:transaction-labels",
	parse: (value) =>
		Object.fromEntries(
			Object.entries(typeof value === "object" && value !== null ? value : {}).filter(
				(entry): entry is [string, TransactionNote] => isNote(entry[1]),
			),
		),
});

export const transactionLabels = {
	read: async (): Promise<Labels> => (await store.get()) ?? {},
	record: async (txid: string, { action, origin }: TransactionNote): Promise<void> => {
		await store.update((labels) => ({ ...labels, [txid]: { action, origin } }));
	},
};

function isNote(value: unknown): value is TransactionNote {
	const note = value as Partial<TransactionNote> | null;

	return typeof note?.action === "string" && typeof note.origin === "string";
}
