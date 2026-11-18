import browser from "webextension-polyfill";

const POPUP_HEIGHT = 600;

export const IN_TAB = new URLSearchParams(location.search).has("tab");

export async function defaultZoom(): Promise<number> {
	try {
		return (await browser.tabs.getZoomSettings()).defaultZoomFactor ?? 1;
	} catch {
		return 1;
	}
}

// Chrome caps a popup at 600 screen pixels, so the page shrinks in CSS pixels as the zoom grows.
export async function prepareSurface(): Promise<void> {
	if (IN_TAB) {
		document.documentElement.dataset.surface = "tab";
		return;
	}

	document.documentElement.style.height = `${POPUP_HEIGHT / (await defaultZoom())}px`;
}

export function openInTab(path: string): void {
	void browser.tabs.create({ url: browser.runtime.getURL(`src/popup.html?tab#${path}`) });
	window.close();
}
