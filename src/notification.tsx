import { definePegasusMessageBus } from "@webext-pegasus/transport";
import { initPegasusTransport } from "@webext-pegasus/transport/popup";
import React from "react";
import { createRoot } from "react-dom/client";

import "@/localization";

import "./notification.css";

import type { PegasusMsgProtocolMap } from "@/background";
import ActionsHandler from "@/common/ActionsHandler";
import { ConfirmProvider } from "@/common/ConfirmationPopup";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { initGlobalErrorReporting } from "@/core";

initPegasusTransport();
initGlobalErrorReporting();

const messageBus = definePegasusMessageBus<PegasusMsgProtocolMap>();
const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Notification root element was not found");
}

createRoot(rootElement).render(
	<React.StrictMode>
		<AppErrorBoundary>
			<ThemeProvider>
				<ConfirmProvider>
					<ActionsHandler messageBus={messageBus} />
				</ConfirmProvider>
			</ThemeProvider>
		</AppErrorBoundary>
	</React.StrictMode>,
);
