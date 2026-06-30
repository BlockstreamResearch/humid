const INPUT_CHARSET =
	"0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
const CHECKSUM_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0xf5dee51989n, 0xa9fdca3312n, 0x1bab10e32dn, 0x3706b1677an, 0x644d626ffdn];

export function addDescriptorChecksum(descriptor: string): string {
	const symbols = expandDescriptorSymbols(descriptor);
	const checksum = polymod([...symbols, 0, 0, 0, 0, 0, 0, 0, 0]) ^ 1n;
	let checksumString = "";

	for (let index = 0; index < 8; index += 1) {
		const shift = 5n * BigInt(7 - index);
		const characterIndex = Number((checksum >> shift) & 31n);
		checksumString += CHECKSUM_CHARSET[characterIndex];
	}

	return `${descriptor}#${checksumString}`;
}

function expandDescriptorSymbols(descriptor: string): number[] {
	const groups: number[] = [];
	const symbols: number[] = [];

	for (const character of descriptor) {
		const value = INPUT_CHARSET.indexOf(character);

		if (value === -1) {
			throw new Error(`Descriptor contains an unsupported checksum character: ${character}`);
		}

		symbols.push(value & 31);
		groups.push(value >> 5);

		if (groups.length === 3) {
			symbols.push(groups[0] * 9 + groups[1] * 3 + groups[2]);
			groups.length = 0;
		}
	}

	if (groups.length === 1) {
		symbols.push(groups[0]);
	} else if (groups.length === 2) {
		symbols.push(groups[0] * 3 + groups[1]);
	}

	return symbols;
}

function polymod(symbols: number[]): bigint {
	let checksum = 1n;

	for (const value of symbols) {
		const top = checksum >> 35n;
		checksum = ((checksum & 0x7ffffffffn) << 5n) ^ BigInt(value);

		for (let index = 0; index < GENERATOR.length; index += 1) {
			if (((top >> BigInt(index)) & 1n) === 1n) {
				checksum ^= GENERATOR[index];
			}
		}
	}

	return checksum;
}
