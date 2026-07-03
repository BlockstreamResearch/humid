import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			// 'font-size': [{ text: Object.keys(fontSize) }],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const toRGB = (str: string) => {
	let hash = 0;
	if (str.length === 0) throw new TypeError("String length is 0");
	for (let i = 0; i < str.length; i++) {
		hash = str.charCodeAt(i) + ((hash << 5) - hash);
		hash = hash & hash;
	}
	const rgb = [0, 0, 0];
	for (let i = 0; i < 3; i++) {
		const value = (hash >> (i * 8)) & 255;
		rgb[i] = value;
	}
	return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
};
