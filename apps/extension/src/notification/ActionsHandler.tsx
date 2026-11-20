import { definePegasusMessageBus } from "@webext-pegasus/transport";
import { useEffect } from "react";

import type { PegasusMsgProtocolMap } from "@/background";
import { useConfirm, useShowOutcome } from "@/common/Confirmation";
import { MsgProtocolRequestMethods, MsgProtocolResponseMethods } from "@/helpers/background";

type ActionsHandlerProps = {
	messageBus: ReturnType<typeof definePegasusMessageBus<PegasusMsgProtocolMap>>;
};

export default function ActionsHandler({ messageBus }: ActionsHandlerProps) {
	const confirm = useConfirm();
	const showOutcome = useShowOutcome();

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

		const removeShowOutcomeListener = messageBus.onMessage(
			MsgProtocolRequestMethods.ShowOutcome,
			({ data }) => showOutcome(data.data),
		);

		return () => {
			removeRequestConfirmationListener();
			removeShowOutcomeListener();
		};
	}, [confirm, messageBus, showOutcome]);

	return null;
}
