/**
 * One connect attempt, settled by what happens after it starts and by nothing else.
 *
 * This exists because the obvious way to write it is wrong in a way nobody sees until the
 * second attempt. AppKit publishes what happened as a single retained value: its events
 * controller keeps the last event in state, and the React hook over it seeds itself from that
 * standing value and then holds it indefinitely. Settling an attempt by reading that value
 * means an attempt can be settled by an event from a previous one — so a person who closes the
 * wallet window once is refused every time afterwards, before the window even opens, until
 * they reload the page.
 *
 * The shape that removes the class of bug rather than the instance is to subscribe for the
 * duration of the attempt and read nothing standing. A subscription only ever delivers what
 * has just happened, so an attempt cannot be settled by anything that happened before it
 * began, whatever the caller did previously.
 */

/**
 * What one attempt needs of the wallet modal, and deliberately nothing more.
 *
 * Named as three plain operations rather than as AppKit's own types so that the rule above is
 * checkable without a browser, a modal or a wallet. `subscribeEvents` returns the function that
 * ends the subscription, which is the whole of what makes an attempt bounded.
 */
export type ConnectHost = {
	close: () => Promise<void>;
	/** Whatever opening produced is discarded: an attempt turns on the events, not on this. */
	open: () => Promise<unknown>;
	subscribeEvents: (listener: (signal: ConnectSignal) => void) => () => void;
};

/**
 * One thing the modal reported, reduced to what decides an attempt.
 *
 * `connected` is stated only where the modal states it — closing the window means two opposite
 * things depending on whether a wallet was connected first, and the flag is the only thing that
 * separates them.
 */
export type ConnectSignal = {
	connected?: boolean;
	name: string;
};

/**
 * Opens the wallet modal and resolves when this attempt connects.
 *
 * Rejects when the wallet reports a failure, when the person closes the window without
 * connecting, and when the modal cannot be opened at all. Every one of those is terminal for
 * this attempt and for no other: the subscription is dropped the moment it settles, so a later
 * event belongs to whatever attempt is running then.
 */
export function connectOnce(host: ConnectHost): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		let unsubscribe: (() => void) | undefined;

		const settle = (outcome: () => void, closeModal: boolean) => {
			if (settled) {
				return;
			}

			settled = true;
			unsubscribe?.();

			// The window is already gone when the person closed it themselves; closing it again
			// would be a second close event about an attempt that has already ended.
			if (closeModal) {
				void host.close();
			}

			outcome();
		};

		const rejectWith = (message: string) => () => {
			reject(new Error(message));
		};

		unsubscribe = host.subscribeEvents((signal) => {
			if (signal.name === "CONNECT_SUCCESS") {
				settle(resolve, true);

				return;
			}

			if (signal.name === "CONNECT_ERROR") {
				settle(rejectWith("Failed to connect to the wallet"), true);

				return;
			}

			if (signal.name === "MODAL_CLOSE") {
				if (signal.connected) {
					settle(resolve, true);
				} else {
					settle(rejectWith("User closed the modal"), false);
				}
			}
		});

		// A host that answers synchronously has already settled by the time the unsubscribe
		// function exists, and the line above could not have run it. Nothing in AppKit does
		// this; a subscription left behind by an attempt that is over is worth one branch.
		if (settled) {
			unsubscribe();
		}

		// Opening is what the attempt is waiting on, so a failure to open is the attempt
		// failing. Without this the promise would stay pending for a window that never appeared.
		host.open().catch((error: unknown) => {
			settle(() => {
				reject(error instanceof Error ? error : new Error(String(error)));
			}, false);
		});
	});
}
