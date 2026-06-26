import { useEffect } from "react";

import { useConfirm } from "@/common/ConfirmationPopup";
import { MsgProtocolRequestMethods, MsgProtocolResponseMethods } from "@/helpers/background";
import { messageBus } from "@/popup";

export default function ActionsHandler() {
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
	}, [confirm]);

	return null;
}
