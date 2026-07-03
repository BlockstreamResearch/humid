import { definePegasusMessageBus } from "@webext-pegasus/transport";
import { useEffect } from "react";

import type { PegasusMsgProtocolMap } from "@/background";
import { useConfirm } from "@/common/Confirmation";
import { MsgProtocolRequestMethods, MsgProtocolResponseMethods } from "@/helpers/background";

type ActionsHandlerProps = {
	messageBus: ReturnType<typeof definePegasusMessageBus<PegasusMsgProtocolMap>>;
};

export default function ActionsHandler({ messageBus }: ActionsHandlerProps) {
	const confirm = useConfirm();

	useEffect(() => {
		const removeRequestConfirmationListener = messageBus.onMessage(
			MsgProtocolRequestMethods.RequestConfirmation,
			async ({ data }) => {
				const decision = data.data ? await confirm(data.data) : { approved: false };

				await messageBus.sendMessage(MsgProtocolResponseMethods.ConfirmResponse, {
					id: data.id ?? -1,
					data: decision,
				});
			},
		);

		return () => {
			removeRequestConfirmationListener();
		};
	}, [confirm, messageBus]);

	return null;
}
