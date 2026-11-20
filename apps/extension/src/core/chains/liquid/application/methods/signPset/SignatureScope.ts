const ALL = 1;
const NONE = 2;
const SINGLE = 3;
const ANYONECANPAY = 0x80;

export class SignatureScope {
	constructor(
		private readonly sighashType: number,
		private readonly input: number,
		private readonly outputCount: number,
	) {}

	get warning(): string | undefined {
		const base = this.sighashType & 0x1f;
		const anyoneCanPay = (this.sighashType & ANYONECANPAY) !== 0;
		const input = this.input + 1;

		if (this.sighashType === 0 || (base === ALL && !anyoneCanPay)) return undefined;
		if (![ALL, NONE, SINGLE].includes(base)) {
			return `Input ${input} asks for a signature the wallet does not recognise.`;
		}

		const pairedOutput = base === SINGLE && this.input < this.outputCount;
		const inputs = anyoneCanPay ? "only that input" : "every input";
		const outputs = base === ALL ? "every output" : pairedOutput ? `output ${input}` : "no outputs";

		return `The signature on input ${input} covers ${inputs} and ${outputs}. ${this.consequence(base === ALL, pairedOutput, anyoneCanPay)}`;
	}

	private consequence(all: boolean, pairedOutput: boolean, anyoneCanPay: boolean): string {
		if (all) return "Others can add inputs to the transaction.";
		if (!pairedOutput) return "Whoever holds the signed transaction can send these funds anywhere.";

		return anyoneCanPay
			? "Whoever holds the signed transaction can change everything else."
			: "Whoever holds the signed transaction can change the other outputs.";
	}
}
