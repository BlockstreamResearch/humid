import { expect } from "@playwright/test";

export const ESPLORA_URL = "http://127.0.0.1:3000";

export type ChainTransaction = { fee: number; status: { confirmed: boolean } };

export async function confirmedTransaction(txid: string): Promise<ChainTransaction> {
	let transaction: ChainTransaction | undefined;

	await expect
		.poll(
			async () => {
				const response = await fetch(`${ESPLORA_URL}/tx/${txid}`);

				transaction = response.ok ? ((await response.json()) as ChainTransaction) : undefined;

				return transaction?.status.confirmed ?? false;
			},
			{ message: `transaction ${txid} confirms`, timeout: 60_000 },
		)
		.toBe(true);

	return transaction!;
}
