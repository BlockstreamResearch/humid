import { logger } from "@/core/logger";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";
import { sleep } from "@/helpers/promise";

import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import type { SignedHold, TransactionNote } from "../../../application/signedHold";
import type { LiquidChainBackend, LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { loadLwkWasm } from "../loadLwkWasm";
import { getLwkImplementation } from "./getLwkImplementation";

// Long past an indexer's lag; a transaction never broadcast or dropped stops hiding its coins after this.
const HELD_MS = 10 * 60_000;

const BUSY_STATUSES = [429, 503];
const RETRIES = 6;

const SPENT_REASONS = ["bad-txns-inputs-missingorspent", "missing-inputs", "txn-mempool-conflict"];

export type HeldTransaction = SignedHold & { at: number; txid: string };

type Sent = {
	accountGroupId?: string;
	at: number;
	chainId: string;
	descriptor: string;
	hex: string;
	signed?: SignedHold;
	txid: string;
};

export class TransactionRefusedError extends WalletRpcResourceUnavailableError {
	constructor(reason: string) {
		super(
			`The network refused the transaction: ${reason}`,
			undefined,
			WALLET_RPC_ERROR_REASONS.TRANSACTION_REFUSED,
		);
		this.name = "TransactionRefusedError";
	}
}

type RecordLabel = (txid: string, note: TransactionNote) => Promise<void>;

export class SentTransactions {
	#sent: Sent[] = [];
	readonly #recordLabel: RecordLabel;

	constructor(recordLabel: RecordLabel = recordInVault) {
		this.#recordLabel = recordLabel;
	}

	async broadcast(
		account: LiquidWalletAccount,
		hex: string,
		note?: TransactionNote,
	): Promise<string> {
		const txid = await post(account.chain.settings.backend, hex);

		this.#hold(account, hex, txid);

		if (note !== undefined) await this.#label(txid, note);

		return txid;
	}

	async remember(account: LiquidWalletAccount, hex: string, signed: SignedHold): Promise<void> {
		const lwk = await loadLwkWasm();
		const transaction = lwk.Transaction.fromString(hex);

		const txid = transaction.txid().toString();

		transaction.free();
		this.#hold(account, hex, txid, signed);
		await this.#label(txid, signed);
	}

	async applyTo(account: LiquidWalletAccount): Promise<void> {
		const ours = this.#live().filter(({ descriptor }) => descriptor === account.descriptor);

		if (ours.length === 0) return;

		const { wollet } = getLwkImplementation(account);
		const scanned = new Set(
			wollet.transactions().map((transaction) => {
				try {
					return transaction.txid().toString();
				} finally {
					transaction.free();
				}
			}),
		);
		const lwk = await loadLwkWasm();

		this.#forget(ours.filter(({ txid }) => scanned.has(txid)));

		for (const { hex, txid } of ours) {
			if (!scanned.has(txid)) wollet.applyTransaction(lwk.Transaction.fromString(hex)).free();
		}
	}

	async signedFor(chain: LiquidChainRecord, accountGroupId: string): Promise<HeldTransaction[]> {
		const held = this.#live().filter(
			(sent) =>
				sent.signed !== undefined &&
				sent.chainId === chain.id &&
				sent.accountGroupId === accountGroupId,
		);
		const landed = await Promise.all(held.map(({ txid }) => isKnown(chain.settings.backend, txid)));

		this.#forget(held.filter((_, at) => landed[at]));

		return held
			.filter((_, at) => !landed[at])
			.map(({ at, signed, txid }) => ({ ...signed!, at, txid }));
	}

	release(txid: string): void {
		this.#sent = this.#sent.filter((sent) => sent.txid !== txid || sent.signed === undefined);
	}

	#hold(account: LiquidWalletAccount, hex: string, txid: string, signed?: SignedHold): void {
		this.#sent.push({
			...(account.accountGroupId === undefined ? {} : { accountGroupId: account.accountGroupId }),
			at: Date.now(),
			chainId: account.chainId,
			descriptor: account.descriptor,
			hex,
			...(signed === undefined ? {} : { signed }),
			txid,
		});
	}

	async #label(txid: string, note: TransactionNote): Promise<void> {
		try {
			await this.#recordLabel(txid, note);
		} catch (error) {
			logger.warn("[liquid] Could not record which dapp made a transaction", { error });
		}
	}

	#live(): Sent[] {
		this.#sent = this.#sent.filter(({ at }) => Date.now() - at < HELD_MS);

		return this.#sent;
	}

	#forget(gone: Sent[]): void {
		this.#sent = this.#sent.filter((sent) => !gone.includes(sent));
	}
}

export const sentTransactions = new SentTransactions();

async function recordInVault(txid: string, note: TransactionNote): Promise<void> {
	const { transactionLabels } = await import("../../../application/transactionLabels");

	await transactionLabels.record(txid, note);
}

async function post(backend: LiquidChainBackend, hex: string): Promise<string> {
	for (let attempt = 0; ; attempt += 1) {
		// oxlint-disable-next-line no-await-in-loop
		const response = await request(backend, "/tx", { body: hex, method: "POST" });

		if (BUSY_STATUSES.includes(response.status) && attempt < RETRIES) {
			// oxlint-disable-next-line no-await-in-loop
			await sleep(1000 * 2 ** attempt);

			continue;
		}

		// oxlint-disable-next-line no-await-in-loop
		const answer = (await response.text()).trim();

		if (response.ok && /^[0-9a-f]{64}$/i.test(answer)) return answer.toLowerCase();

		throw new TransactionRefusedError(
			reasonOf(answer) || `the backend answered ${response.status}`,
		);
	}
}

async function isKnown(backend: LiquidChainBackend, txid: string): Promise<boolean> {
	try {
		return (await request(backend, `/tx/${txid}`, {})).ok;
	} catch {
		return false;
	}
}

function request(backend: LiquidChainBackend, path: string, init: RequestInit): Promise<Response> {
	return fetch(`${backend.url.replace(/\/+$/, "")}${path}`, {
		...init,
		headers: Object.fromEntries(
			(backend.headers ?? []).filter(({ name }) => name).map(({ name, value }) => [name, value]),
		),
		...(backend.timeout === undefined
			? {}
			: { signal: AbortSignal.timeout(backend.timeout * 1000) }),
	});
}

function reasonOf(answer: string): string {
	let reason = answer.replace(/^sendrawtransaction RPC error[^:]*:\s*/, "");

	try {
		const { message } = JSON.parse(reason) as { message?: unknown };

		if (typeof message === "string") reason = message;
	} catch {}

	return SPENT_REASONS.some((spent) => reason.includes(spent))
		? `a coin it spends is already spent (${reason}). Send the request again.`
		: reason;
}
