import browser, { type Runtime } from "webextension-polyfill";

import {
	FROM_PAGE,
	FROM_WALLET,
	PAGE_PORT_NAME,
	parsePageRequest,
} from "@/core/extension-background/page-port/protocol";
import { logger } from "@/core/logger";

// The page reaches the wallet only through this relay, and only with well-formed requests.
let port: Runtime.Port | null = null;

function connect(): Runtime.Port {
	const opened = browser.runtime.connect({ name: PAGE_PORT_NAME });

	opened.onMessage.addListener((reply: unknown) => {
		window.postMessage({ ...(reply as object), source: FROM_WALLET }, "*");
	});
	// A restarted service worker drops the port; reconnect so wallet events keep arriving.
	opened.onDisconnect.addListener(() => {
		port = null;
		connect();
	});
	port = opened;

	return opened;
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
	if (event.source !== window) return;

	const data = event.data as { source?: unknown } | null;

	if (data?.source !== FROM_PAGE) return;

	const request = parsePageRequest(data);

	if (request) (port ?? connect()).postMessage(request);
});

function injectProvider(url: string) {
	try {
		const container = document.head || document.documentElement;
		const scriptTag = document.createElement("script");
		scriptTag.setAttribute("type", "module");
		scriptTag.setAttribute("async", "false");
		scriptTag.setAttribute("src", url);
		container.insertBefore(scriptTag, container.children[0]);
		container.removeChild(scriptTag);
	} catch (error) {
		logger.error("Provider injection failed.", error);
	}
}

connect();
injectProvider(browser.runtime.getURL("src/content-script/provider.js"));
