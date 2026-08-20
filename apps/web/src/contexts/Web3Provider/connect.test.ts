import { describe, expect, test } from "bun:test";

import { connectOnce, type ConnectHost, type ConnectSignal } from "./connect";

/**
 * A stand-in for AppKit's events, built to the same shape as the real one.
 *
 * The detail this file exists for is that the real controller retains its last event forever:
 * the value stays in state after the attempt that produced it is over, and anything reading
 * that value rather than subscribing sees the previous attempt's ending as if it had just
 * happened. `last` here is that retained value. `subscribe` never replays it — which is what
 * the real subscription does, and what the connect attempt is required to rely on.
 */
function fakeAppKit() {
	const listeners = new Set<(signal: ConnectSignal) => void>();
	const opened: number[] = [];
	const closed: number[] = [];
	let last: ConnectSignal | undefined;
	let openFails: Error | undefined;

	const host: ConnectHost = {
		close: async () => {
			closed.push(Date.now());
		},
		open: async () => {
			opened.push(Date.now());

			if (openFails) {
				throw openFails;
			}
		},
		subscribeEvents: (listener) => {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
	};

	return {
		closes: () => closed.length,
		emit: (signal: ConnectSignal) => {
			last = signal;

			// Deleting the current entry mid-iteration is defined behaviour on a Set, which is
			// what a listener that unsubscribes itself on the event it just received does.
			for (const listener of listeners) {
				listener(signal);
			}
		},
		failOpenWith: (error: Error) => {
			openFails = error;
		},
		host,
		listeners: () => listeners.size,
		opens: () => opened.length,
		retained: () => last,
	};
}

/** What an attempt has come to, without awaiting it and without leaving a rejection unhandled. */
function watch(attempt: Promise<void>) {
	const state = { outcome: "pending" as "pending" | "rejected" | "resolved", reason: "" };

	attempt.then(
		() => {
			state.outcome = "resolved";
		},
		(error: unknown) => {
			state.outcome = "rejected";
			state.reason = error instanceof Error ? error.message : String(error);
		},
	);

	return state;
}

/** One turn of the event loop, which is longer than anything here needs to settle. */
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("what settles one connect attempt", () => {
	// The defect this file was written for. A person closes the wallet window, is told so, and
	// clicks connect again — and the second attempt was refused before the window opened,
	// because the ending of the first one was still standing in AppKit's event state.
	test("an event from before the attempt began does not settle it", async () => {
		const appKit = fakeAppKit();

		appKit.emit({ connected: false, name: "MODAL_CLOSE" });
		expect(appKit.retained()).toEqual({ connected: false, name: "MODAL_CLOSE" });

		const attempt = watch(connectOnce(appKit.host));

		await settle();

		expect(attempt.outcome).toBe("pending");
		expect(appKit.opens()).toBe(1);

		appKit.emit({ name: "CONNECT_SUCCESS" });
		await settle();

		expect(attempt.outcome).toBe("resolved");
	});

	// The same thing said as the person meets it: connecting has to work the second time.
	test("connecting again after the window was closed reaches the wallet", async () => {
		const appKit = fakeAppKit();

		const first = watch(connectOnce(appKit.host));

		appKit.emit({ connected: false, name: "MODAL_CLOSE" });
		await settle();

		expect(first.outcome).toBe("rejected");
		expect(first.reason).toBe("User closed the modal");

		const second = watch(connectOnce(appKit.host));

		await settle();

		expect(second.outcome).toBe("pending");
		expect(appKit.opens()).toBe(2);

		appKit.emit({ name: "CONNECT_SUCCESS" });
		await settle();

		expect(second.outcome).toBe("resolved");
	});

	test("a connected wallet resolves the attempt and closes the window", async () => {
		const appKit = fakeAppKit();
		const attempt = watch(connectOnce(appKit.host));

		appKit.emit({ name: "CONNECT_SUCCESS" });
		await settle();

		expect(attempt.outcome).toBe("resolved");
		expect(appKit.closes()).toBe(1);
	});

	test("a wallet that reports a failure rejects the attempt and closes the window", async () => {
		const appKit = fakeAppKit();
		const attempt = watch(connectOnce(appKit.host));

		appKit.emit({ name: "CONNECT_ERROR" });
		await settle();

		expect(attempt.outcome).toBe("rejected");
		expect(attempt.reason).toBe("Failed to connect to the wallet");
		expect(appKit.closes()).toBe(1);
	});

	// Closing means two opposite things, and the flag is the only thing that separates them.
	test("a window closed after connecting resolves rather than refuses", async () => {
		const appKit = fakeAppKit();
		const attempt = watch(connectOnce(appKit.host));

		appKit.emit({ connected: true, name: "MODAL_CLOSE" });
		await settle();

		expect(attempt.outcome).toBe("resolved");
	});

	// The person already closed it. Closing it again would be a second ending reported about an
	// attempt that has none left.
	test("a window the person closed is not closed a second time", async () => {
		const appKit = fakeAppKit();
		const attempt = watch(connectOnce(appKit.host));

		appKit.emit({ connected: false, name: "MODAL_CLOSE" });
		await settle();

		expect(attempt.outcome).toBe("rejected");
		expect(appKit.closes()).toBe(0);
	});

	// What keeps the guarantee true for the next attempt rather than only for this one.
	test("a settled attempt is listening to nothing and cannot be settled again", async () => {
		const appKit = fakeAppKit();
		const attempt = watch(connectOnce(appKit.host));

		expect(appKit.listeners()).toBe(1);

		appKit.emit({ connected: false, name: "MODAL_CLOSE" });
		await settle();

		expect(attempt.outcome).toBe("rejected");
		expect(appKit.listeners()).toBe(0);

		appKit.emit({ name: "CONNECT_SUCCESS" });
		await settle();

		expect(attempt.outcome).toBe("rejected");
		expect(appKit.closes()).toBe(0);
	});

	// Without this the promise waits forever on a window that never appeared.
	test("a window that cannot be opened refuses the attempt", async () => {
		const appKit = fakeAppKit();

		appKit.failOpenWith(new Error("The modal did not open"));

		const attempt = watch(connectOnce(appKit.host));

		await settle();

		expect(attempt.outcome).toBe("rejected");
		expect(attempt.reason).toBe("The modal did not open");
		expect(appKit.listeners()).toBe(0);
	});

	test("an event about nothing this attempt is waiting for leaves it running", async () => {
		const appKit = fakeAppKit();
		const attempt = watch(connectOnce(appKit.host));

		appKit.emit({ connected: false, name: "MODAL_OPEN" });
		appKit.emit({ name: "SELECT_WALLET" });
		await settle();

		expect(attempt.outcome).toBe("pending");

		appKit.emit({ name: "CONNECT_SUCCESS" });
		await settle();

		expect(attempt.outcome).toBe("resolved");
	});
});
