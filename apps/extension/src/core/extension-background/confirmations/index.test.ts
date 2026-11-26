import { expect, mock, test } from "bun:test";

import { sleep } from "@/helpers/promise";

mock.module("@/helpers/background", () => ({
	closeNotification: async () => {},
	MsgProtocolRequestMethods: {
		Request: "request",
		RequestConfirmation: "requestConfirmation",
		ShowOutcome: "showOutcome",
	},
	MsgProtocolResponseMethods: {
		ConfirmResponse: "CONFIRM_RESPONSE",
		RequestResponse: "request_response",
	},
	openNotification: async () => 1,
}));

const { createConfirmationResponder } = await import(".");

type Listener = (message: { data: unknown; sender: { context: string } }) => void;

function popupBus() {
	const listeners = new Map<string, Listener>();
	const asked = Promise.withResolvers<string>();
	const bus = {
		onMessage: (key: string, listener: Listener) => {
			listeners.set(key, listener);

			return () => listeners.delete(key);
		},
		sendMessage: (key: string, data: { id: string }) => {
			if (key === "requestConfirmation") asked.resolve(data.id);

			return new Promise(() => {});
		},
	};
	const answer = (context: string, id: string) =>
		listeners.get("CONFIRM_RESPONSE")?.({
			data: { data: { approved: true }, id },
			sender: { context },
		});

	return { answer, asked: asked.promise, bus };
}

test("only the wallet's own window can answer a confirmation, under an id nobody can guess", async () => {
	const { answer, asked, bus } = popupBus();
	const confirmations = createConfirmationResponder(bus as never, {
		isUnlocked: async () => true,
		noteActivity: () => {},
		onUnlocked: () => {},
	});
	const decision = confirmations.confirm({ title: "Connect this dapp?" });
	const id = await asked;

	expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

	for (const context of ["window", "content-script", "background", "options"]) answer(context, id);

	expect(await Promise.race([decision, sleep(50).then(() => "still pending")])).toBe(
		"still pending",
	);

	answer("popup", id);
	expect(await decision).toEqual({ approved: true });
});

test("a review that never comes back can still be cancelled, and the next approval is asked", async () => {
	const { answer, asked, bus } = popupBus();
	const confirmations = createConfirmationResponder(bus as never, {
		isUnlocked: async () => true,
		noteActivity: () => {},
		onUnlocked: () => {},
	});
	const stuck = confirmations.confirm(new Promise(() => {}));

	await sleep(300);
	confirmations.cancelAll();

	expect(await stuck).toEqual({ approved: false });

	const next = confirmations.confirm({ title: "Connect this dapp?" });
	const id = await Promise.race([asked, sleep(500).then(() => "never asked")]);

	expect(id).not.toBe("never asked");

	answer("popup", id);
	expect(await next).toEqual({ approved: true });
});
