import { getRPCService } from "@webext-pegasus/rpc";
import { definePegasusEventBus, definePegasusMessageBus } from "@webext-pegasus/transport";
import { initPegasusTransport } from "@webext-pegasus/transport/content-script";
import browser from "webextension-polyfill";

import { ISelfIDService } from "@/helpers/background";

function injectScript(url: string) {
	try {
		const container = document.head || document.documentElement;
		const scriptTag = document.createElement("script");
		scriptTag.setAttribute("type", "module");
		scriptTag.setAttribute("async", "false");
		scriptTag.setAttribute("src", url);
		container.insertBefore(scriptTag, container.children[0]);
		container.removeChild(scriptTag);
	} catch (error) {
		console.error("Provider injection failed.", error);
	}
}

const init = async () => {
	initPegasusTransport({
		allowWindowMessagingForNamespace: "humid",
	});
	definePegasusEventBus();
	definePegasusMessageBus();

	injectScript(browser.runtime.getURL("src/content-script/provider.js"));

	await getRPCService<ISelfIDService>("getSelfID", "background")();
};

void init();
