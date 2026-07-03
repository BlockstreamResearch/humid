import en from "./resources/en.json";

export const resources = {
	en: {
		translation: {
			...en,
		},
	},
};

export type Language = keyof typeof resources;
