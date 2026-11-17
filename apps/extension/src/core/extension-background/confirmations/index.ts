import { AsyncQueuer, Debouncer } from "@tanstack/pacer";

import { UNLOCK_CONFIRMATION } from "@/core/secure-vault/application/wallet-vault/unlockConfirmation";
import type {
	ConfirmationCompletion,
	ConfirmationDecision,
	ConfirmationOutcome,
	ConfirmationRequest,
} from "@/helpers/background";
import {
	closeNotification,
	MsgProtocolRequestMethods,
	MsgProtocolResponseMethods,
	openNotification,
} from "@/helpers/background";
import { sleep } from "@/helpers/promise";

import type { BackgroundMessageBus } from "../transport";

const CONFIRMATION_TIMEOUT_MS = 30_000;
const NOTIFICATION_SETTLE_MS = 200;
const UNLOCK_PRIORITY = 1;

export type ConfirmationResponder = {
	confirm: <TResult = unknown>(
		request: ConfirmationRequest,
		complete?: ConfirmationCompletion,
	) => Promise<ConfirmationDecision<TResult>>;
	/** Resolves once the wallet is unlocked or the queued unlock prompt is dismissed. */
	waitForUnlock: () => Promise<void>;
	cancelAll: () => void;
};

export type ConfirmationWalletLock = {
	isUnlocked: () => Promise<boolean>;
	onUnlocked: (listener: () => void) => void;
};

type PendingConfirmation = {
	decision: Promise<ConfirmationDecision>;
	fail: (error: unknown) => void;
	finish: (outcome: ConfirmationOutcome) => void;
	outcome: Promise<ConfirmationOutcome>;
	priority: number;
	request: ConfirmationRequest;
	settle: (decision: ConfirmationDecision) => void;
	settled: boolean;
};

export function createConfirmationResponder(
	messageBus: BackgroundMessageBus,
	wallet: ConfirmationWalletLock,
): ConfirmationResponder {
	let active: PendingConfirmation | null = null;
	let pendingUnlock: PendingConfirmation | null = null;
	let windowId: number | undefined;

	const present = async (entry: PendingConfirmation): Promise<void> => {
		if (entry.settled) return;

		active = entry;
		const id = Math.floor(Math.random() * 1_000_000);
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let removeResponseListener: (() => void) | undefined;
		let showsOutcome = false;

		try {
			windowId = await openNotification();
			if (entry.settled) return;
			await sleep(NOTIFICATION_SETTLE_MS);
			if (entry.settled) return;

			timeout = setTimeout(
				() => entry.settle({ approved: false }),
				entry.request.timeoutMs ?? CONFIRMATION_TIMEOUT_MS,
			);
			removeResponseListener = messageBus.onMessage(
				MsgProtocolResponseMethods.ConfirmResponse,
				({ data: response }) => {
					if (response.id !== id) return;
					entry.settle(response.data ?? { approved: false });
				},
			);
			// The popup handler only returns after the user decides, so it cannot gate the queue:
			// timeouts, unlocks elsewhere and cancellation settle the entry without the popup.
			messageBus
				.sendMessage(
					MsgProtocolRequestMethods.RequestConfirmation,
					{ id, data: entry.request },
					"popup",
				)
				.catch(entry.fail);
			const decision = await entry.decision;

			if (decision.approved && entry.request.completes) {
				const outcome = await entry.outcome;

				showsOutcome = true;
				// The popup answers once the outcome is dismissed; a newer request may replace it first.
				messageBus
					.sendMessage(MsgProtocolRequestMethods.ShowOutcome, { id, data: outcome }, "popup")
					.then(
						() => closeWindowWhenIdle.maybeExecute(),
						() => undefined,
					);
			}
		} catch (error) {
			entry.fail(error);
		} finally {
			clearTimeout(timeout);
			removeResponseListener?.();
			active = null;
			if (!showsOutcome) closeWindowWhenIdle.maybeExecute();
		}
	};

	const queue = new AsyncQueuer<PendingConfirmation>(present, { concurrency: 1 });

	// Consecutive confirmations reuse the open window; it closes once nothing is left to show.
	const closeWindowWhenIdle = new Debouncer(
		() => {
			if (windowId === undefined || active !== null || queue.peekAllItems().length > 0) return;

			void closeNotification(windowId);
			windowId = undefined;
		},
		{ wait: NOTIFICATION_SETTLE_MS },
	);

	const enqueue = (request: ConfirmationRequest, priority = 0): PendingConfirmation => {
		const entry = createPendingConfirmation(request, priority);

		queue.addItem(entry);

		return entry;
	};

	wallet.onUnlocked(() => pendingUnlock?.settle({ approved: true }));

	return {
		cancelAll: () => {
			for (const entry of queue.peekPendingItems()) entry.settle({ approved: false });
			queue.clear();
			active?.settle({ approved: false });
			windowId = undefined;
		},
		confirm: async <TResult = unknown>(
			request: ConfirmationRequest,
			complete?: ConfirmationCompletion,
		) => {
			const entry = enqueue(complete ? { ...request, completes: true } : request);
			const decision = (await entry.decision) as ConfirmationDecision<TResult>;

			if (!decision.approved || !complete) return decision;

			try {
				entry.finish({ receipt: await complete(decision.result) });
			} catch (error) {
				entry.finish({ error: error instanceof Error ? error.message : "The request failed." });
				throw error;
			}

			return decision;
		},
		waitForUnlock: async () => {
			if (await wallet.isUnlocked()) return;

			let unlock = pendingUnlock;

			if (!unlock) {
				const entry = enqueue(UNLOCK_CONFIRMATION, UNLOCK_PRIORITY);
				const release = () => {
					if (pendingUnlock === entry) pendingUnlock = null;
				};

				unlock = pendingUnlock = entry;
				entry.decision.then(release, release);

				// The wallet may have unlocked while the status above was being read.
				if (await wallet.isUnlocked()) entry.settle({ approved: true });
			}

			await unlock.decision.catch(() => undefined);
		},
	};
}

function createPendingConfirmation(
	request: ConfirmationRequest,
	priority: number,
): PendingConfirmation {
	const { promise, resolve, reject } = Promise.withResolvers<ConfirmationDecision>();
	const outcome = Promise.withResolvers<ConfirmationOutcome>();
	const entry: PendingConfirmation = {
		decision: promise,
		fail: (error) => {
			if (entry.settled) return;
			entry.settled = true;
			reject(error);
		},
		finish: outcome.resolve,
		outcome: outcome.promise,
		priority,
		request,
		settle: (decision) => {
			if (entry.settled) return;
			entry.settled = true;
			resolve(decision);
		},
		settled: false,
	};

	return entry;
}
