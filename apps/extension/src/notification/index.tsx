import { definePegasusMessageBus } from "@webext-pegasus/transport";
import { initPegasusTransport } from "@webext-pegasus/transport/popup";
import React from "react";
import { createRoot } from "react-dom/client";

import "@/localization";

import "./notification.css";

import type { PegasusMsgProtocolMap } from "@/background";
import { ConfirmProvider } from "@/common/Confirmation";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { dappAddChainConfirmationRenderer } from "@/core/extension-background/dapp-authorization/DappAddChainConfirmation";
import { dappConnectConfirmationRenderer } from "@/core/extension-background/dapp-authorization/DappConnectConfirmation";
import { dappSwitchChainConfirmationRenderer } from "@/core/extension-background/dapp-authorization/DappSwitchChainConfirmation";
import { initGlobalErrorReporting } from "@/core/report";

import ActionsHandler from "./ActionsHandler";

initPegasusTransport();
initGlobalErrorReporting();

const messageBus = definePegasusMessageBus<PegasusMsgProtocolMap>();
const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Notification root element was not found");
}

// Confirmations shown in the notification window: the generic host + the dapp renderers (connect,
// add-chain, switch-chain).
const confirmationRenderers = [
	dappConnectConfirmationRenderer,
	dappAddChainConfirmationRenderer,
	dappSwitchChainConfirmationRenderer,
];

createRoot(rootElement).render(
	<React.StrictMode>
		<AppErrorBoundary>
			<ThemeProvider>
				<ConfirmProvider renderers={confirmationRenderers}>
					<ActionsHandler messageBus={messageBus} />
				</ConfirmProvider>
			</ThemeProvider>
		</AppErrorBoundary>
	</React.StrictMode>,
);
