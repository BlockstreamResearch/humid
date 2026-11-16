import { formatUnits } from "@/helpers/formatters";

export class ShownAsset {
	constructor(
		readonly id: string,
		readonly ticker?: string,
		readonly decimals?: number,
	) {}

	get label(): string {
		return this.ticker ?? `${this.id.slice(0, 4)}…${this.id.slice(-4)}`;
	}

	get note(): string | undefined {
		if (this.ticker === undefined) {
			return this.decimals === undefined ? "Unknown asset, raw units" : "Unknown asset";
		}
		return this.decimals === undefined ? "Raw units" : undefined;
	}

	amount(units: bigint, signed = false): string {
		const magnitude = units < 0n ? -units : units;
		const text =
			this.decimals === undefined ? magnitude.toString() : formatUnits(magnitude, this.decimals);
		if (!signed) return text;
		return `${units < 0n ? "−" : "+"}${text}`;
	}

	amountWithLabel(units: bigint): string {
		return this.ticker === undefined
			? `${this.amount(units)} · ${this.label}`
			: `${this.amount(units)} ${this.ticker}`;
	}
}
