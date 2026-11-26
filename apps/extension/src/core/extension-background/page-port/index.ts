import browser, { type Runtime } from "webextension-polyfill";

import { logger } from "@/core/logger";

import { serializeError } from "../transport";
import { PAGE_PORT_NAME, parsePageRequest, type WalletReply } from "./protocol";

export type PageRequestHandler = (params: unknown, origin: string) => Promise<unknown>;

export type PagePorts = {
	/** Sends a wallet event to every connected page. */
	emit: (event: string, payload: unknown) => void;
};

/**
 * Serves dapp requests on ports opened by the content script. A port belongs to one document, so its
 * origin is read once from the browser's own sender record and cannot be swapped mid-request.
 */
export function servePagePorts(handlers: Promise<Record<string, PageRequestHandler>>): PagePorts {
	const ports = new Set<Runtime.Port>();

	browser.runtime.onConnect.addListener((port) => {
		if (port.name !== PAGE_PORT_NAME) return;

		const origin = originOf(port.sender);

		if (origin !== null) {
			ports.add(port);
			port.onDisconnect.addListener(() => ports.delete(port));
		}

		port.onMessage.addListener(async (message: unknown) => {
			const request = parsePageRequest(message);

			if (!request) return;

			let reply: WalletReply;

			try {
				if (origin === null)
					throw new Error("Only the top frame of a web page can use the wallet.");

				const handler = (await handlers)[request.method];

				if (!handler) throw new Error(`No handler for method: ${request.method}`);

				reply = { id: request.id, result: await handler(request.params, origin) };
			} catch (error) {
				reply = { error: serializeError(error), id: request.id };
			}

			post(port, reply);
		});
	});

	return {
		emit(event, payload) {
			for (const port of ports) post(port, { event, payload });
		},
	};
}

function post(port: Runtime.Port, reply: WalletReply): void {
	try {
		port.postMessage(reply);
	} catch (error) {
		logger.warn("Could not answer a page; it has gone away", { error });
	}
}

function originOf(sender: Runtime.MessageSender | undefined): string | null {
	if (sender?.tab?.id === undefined || sender.frameId !== 0 || !sender.url) return null;

	try {
		const { origin, protocol } = new URL(sender.url);

		return protocol === "https:" || protocol === "http:" ? origin : null;
	} catch {
		return null;
	}
}
