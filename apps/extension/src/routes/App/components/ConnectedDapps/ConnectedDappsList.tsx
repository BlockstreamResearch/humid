import type { ConnectedDappView } from "@/core/dapp-sessions/model";

import { ConnectedDappRow } from "./ConnectedDappRow";
import { ConnectedDappRows } from "./ConnectedDappRows";

export function ConnectedDappsList({
	onRevoke,
	revokingKey,
	...rows
}: {
	dapps: ConnectedDappView[];
	isError: boolean;
	isLoading: boolean;
	onRevoke: (dapp: ConnectedDappView) => void;
	revokingKey: string | null;
}) {
	return (
		<ConnectedDappRows
			{...rows}
			row={(dapp, key) => (
				<ConnectedDappRow
					key={key}
					dapp={dapp}
					isRevoking={revokingKey === key}
					onRevoke={() => onRevoke(dapp)}
				/>
			)}
		/>
	);
}
