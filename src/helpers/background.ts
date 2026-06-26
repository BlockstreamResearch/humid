import type { PegasusRPCMessage } from "@webext-pegasus/rpc";
import browser from "webextension-polyfill";

export type ConfirmationRequest = {
	title: string;
	message?: string;
	data?: unknown;
};

export interface ExtensionMessage<T = unknown> {
	method: string;
	id?: number;
	data?: T;
	error?: unknown;
	type?: string;
}

let popupId: number | undefined;
let isClosingPopupByUserAction = false;

export async function openPopup(url = ""): Promise<number> {
	const popup = await getPopup();

	if (popup?.id !== undefined) {
		await browser.windows.update(popup.id, { focused: true });
		return popup.id;
	}

	const currentWindow = await browser.windows.getCurrent();
	const width = 375;
	const height = 620;
	const left = Math.round((currentWindow.left ?? 0) + (currentWindow.width ?? width) - width);

	const popupWindow = await browser.windows.create({
		url: `src/popup.html${url}`,
		type: "popup",
		width,
		height,
		top: currentWindow.top,
		left,
	});

	popupId = popupWindow.id;
	return popupWindow.id ?? -1;
}

export async function getPopup(): Promise<browser.Windows.Window | null> {
	const windows = await browser.windows.getAll();
	return windows.find((window) => window.type === "popup" && window.id === popupId) ?? null;
}

export function initPopupManagement(): void {
	browser.windows.onRemoved.addListener((windowId) => {
		if (windowId !== popupId) return;

		popupId = undefined;

		if (!isClosingPopupByUserAction) {
			console.warn("Popup closed unexpectedly. Clean up pending operations.");
		}

		isClosingPopupByUserAction = false;
	});
}

export function updateBadge(count = 0): void {
	const browserWithBrowserAction = browser as typeof browser & {
		browserAction?: typeof browser.action;
	};
	const actionApi = browserWithBrowserAction.action ?? browserWithBrowserAction.browserAction;

	if (!actionApi) return;

	const label = count ? String(count) : "";

	void actionApi.setBadgeText({ text: label });
	void actionApi.setBadgeBackgroundColor({ color: "#01579b" });
}

export function updateBadgeOnStorageChange(): void {
	browser.storage.onChanged.addListener(() => {
		updateBadge();
	});
}

export type ISelfIDService = typeof getSelfIDService;

export async function getSelfIDService(message: PegasusRPCMessage): Promise<{
	tabId: number;
	frameId?: number;
}> {
	let tabId: number | undefined = message.sender.tabId;

	if (message.sender.context === "popup") {
		tabId = (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
	}

	if (tabId === undefined) {
		throw new Error(`Could not get tab ID for message: ${String(message)}`);
	}

	return { frameId: message.sender.frameId, tabId };
}

export enum MsgProtocolRequestMethods {
	Request = "request",
	RequestConfirmation = "requestConfirmation",
}

export enum MsgProtocolResponseMethods {
	ConfirmResponse = "CONFIRM_RESPONSE",
	RequestResponse = "request_response",
}

export enum EventProtocolListeners {
	ExtensionEvent = "extension_event",
}

export async function closePopup(id: number) {
	if (id < 0) return;

	isClosingPopupByUserAction = true;
	await browser.windows.remove(id);
}
