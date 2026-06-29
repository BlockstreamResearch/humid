import { definePegasusMessageBus } from "@webext-pegasus/transport";
import { useEffect } from "react";

import type { PegasusMsgProtocolMap } from "@/background";
import { useConfirm } from "@/common/ConfirmationPopup";
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
				const confirmationData = data.data;
				const isConfirmed = await confirm(confirmationData?.title, confirmationData?.message);

				await messageBus.sendMessage(MsgProtocolResponseMethods.ConfirmResponse, {
					id: data.id ?? -1,
					data: isConfirmed,
				});
			},
		);

		return () => {
			removeRequestConfirmationListener();
		};
	}, [confirm, messageBus]);

	return null;
}
