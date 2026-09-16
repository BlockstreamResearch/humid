export type StatedPosition = {
	at: number;
	id: string;
	kind: "input" | "output";
	stated: number;
};

export type PositionCheck = { ok: true } | { ok: false; reason: string };

export function checkPositions(
	stated: StatedPosition[],
	totals: { inputs: number; outputs: number },
): PositionCheck {
	for (const position of stated) {
		const total = position.kind === "input" ? totals.inputs : totals.outputs;
		const wanted = position.stated < 0 ? total + position.stated : position.stated;

		if (wanted === position.at) {
			continue;
		}

		return {
			ok: false,
			reason:
				`The ${position.kind} ${position.id} must be ${position.kind} ` +
				`${describe(position.stated, total)} of this transaction, and this wallet would put it ` +
				`at ${position.at}. A covenant reads positions, so a transaction built in another ` +
				"order is one the network rejects after it has been signed.",
		};
	}

	return { ok: true };
}

function describe(stated: number, total: number): string {
	return stated < 0
		? `${total + stated} — the document counts ${stated} from the end`
		: `${stated}`;
}
