import type { Endpoint } from "@webext-pegasus/transport";
import browser from "webextension-polyfill";

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
