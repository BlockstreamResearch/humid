export type Outpoint = { txid: string; vout: number };

export function outpointKey(outpoint: Outpoint): string {
	return `${outpoint.txid.trim().toLowerCase()}:${outpoint.vout}`;
}

export function byOutpoint<T extends Outpoint>(entries: T[]): T[] {
	const seen = new Set<string>();

	return entries.filter((entry) => {
		const key = outpointKey(entry);

		if (seen.has(key)) {
			return false;
		}

		seen.add(key);

		return true;
	});
}
