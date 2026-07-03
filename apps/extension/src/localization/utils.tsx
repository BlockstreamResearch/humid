import { memoize } from "es-toolkit/compat";
import type TranslateOptions from "i18next";
import i18n from "i18next";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { setDayjsLocale } from "@/helpers/formatters";

import type { Language, resources } from "./resources";
import type { RecursiveKeyOf } from "./types";

type DefaultLocale = typeof resources.en.translation;
export type TxKeyPath = RecursiveKeyOf<DefaultLocale>;

const STORAGE_KEY = "locale";
const DEFAULT_LOCALE = "en";

export const locale = localStorage?.getItem(STORAGE_KEY) ?? DEFAULT_LOCALE;

export const translate = memoize(
	(key: TxKeyPath, options = undefined) => i18n.t(key, options) as unknown as string,
	(key: TxKeyPath, options: typeof TranslateOptions) =>
		options ? key + JSON.stringify(options) : key,
);

export const useTranslate = () => {
	const { t } = useTranslation();

	const translate = useCallback(
		(key: TxKeyPath, options = undefined) => t(key, options) as unknown as string,
		[t],
	);

	return { translate };
};

export const changeLanguage = (lang: Language) => {
	i18n.changeLanguage(lang);

	setDayjsLocale(lang);

	window.location.reload();
};

export const useSelectedLanguage = () => {
	const { i18n } = useTranslation();

	const setLanguage = useCallback((lang: Language) => {
		changeLanguage(lang as Language);
	}, []);

	return { language: i18n.language, setLanguage };
};
