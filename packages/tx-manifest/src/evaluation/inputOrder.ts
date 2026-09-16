export type PlaceableInput<Slot> = {
	id?: string;
	slots: Slot[];
	stated?: number;
};

export type InputPlacement<Slot> = {
	at: Map<string, number>;
	order: Slot[];
};

export function placeInputs<Slot>(declared: PlaceableInput<Slot>[]): InputPlacement<Slot> {
	const total = declared.reduce((count, input) => count + input.slots.length, 0);
	const laid: (Slot | undefined)[] = Array.from({ length: total });
	const at = new Map<string, number>();
	const remaining: PlaceableInput<Slot>[] = [];

	for (const input of declared) {
		if (input.slots.length === 0) {
			continue;
		}

		const wanted = resolve(input.stated, total);

		if (wanted === undefined || !vacant(laid, wanted, input.slots.length)) {
			remaining.push(input);

			continue;
		}

		for (const [offset, slot] of input.slots.entries()) {
			laid[wanted + offset] = slot;
		}

		if (input.id !== undefined) {
			at.set(input.id, wanted);
		}
	}

	let next = 0;

	for (const input of remaining) {
		for (const slot of input.slots) {
			while (laid[next] !== undefined) {
				next += 1;
			}

			if (input.id !== undefined && !at.has(input.id)) {
				at.set(input.id, next);
			}

			laid[next] = slot;
		}
	}

	return { at, order: laid.filter((slot): slot is Slot => slot !== undefined) };
}

function resolve(stated: number | undefined, total: number): number | undefined {
	if (stated === undefined) {
		return undefined;
	}

	return stated < 0 ? total + stated : stated;
}

function vacant<Slot>(laid: (Slot | undefined)[], from: number, length: number): boolean {
	if (!Number.isInteger(from) || from < 0 || from + length > laid.length) {
		return false;
	}

	for (let at = from; at < from + length; at += 1) {
		if (laid[at] !== undefined) {
			return false;
		}
	}

	return true;
}
