import type { Endpoint } from "@webext-pegasus/transport";
import browser from "webextension-polyfill";

/**
 * Resolves the authentic origin of an injected request from the browser-supplied
 * tab URL. The content script's self-reported origin is intentionally not trusted.
 * Returns null when the tab/url cannot be resolved (top-frame origin only).
 */
export async function resolveSenderOrigin(sender: Endpoint): Promise<string | null> {
	if (sender.tabId === null || sender.tabId === undefined) return null;

	try {
		const tab = await browser.tabs.get(sender.tabId);

		if (!tab.url) return null;

		return new URL(tab.url).origin;
	} catch {
		return null;
	}
}
