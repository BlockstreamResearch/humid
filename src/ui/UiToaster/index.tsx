"use client";

import {
	AlertCircleIcon,
	CheckmarkCircle02Icon,
	InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useEffect } from "react";
import { type ExternalToast, toast, Toaster as Sonner } from "sonner";

import { useTheme } from "@/contexts/ThemeProvider";
import { emitter } from "@/core";
import { cn } from "@/theme/utils.ts";

import { DefaultToast } from "./components/DefaultToast";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export type DefaultToastRenderPayload = {
	title?: ReactNode;
	message?: ReactNode;
	icon?: ReactNode;
};

type ToastPayloadWithDefaultLayout = DefaultToastRenderPayload & {
	children?: never;
	duration?: number;
};

type ToastPayloadWithCustomChildren = {
	children: ReactNode;
	title?: never;
	message?: never;
	icon?: never;
	duration?: never;
};

export type DefaultToastPayload = {
	opts?: ExternalToast;
} & (ToastPayloadWithDefaultLayout | ToastPayloadWithCustomChildren);

const DEFAULT_DURATION = 5_000;

export const UiToaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	const showSuccessToast = useCallback((payload: Partial<DefaultToastPayload>) => {
		toast(
			<DefaultToast
				payload={{
					...payload,
					icon: payload.icon || <HugeiconsIcon icon={CheckmarkCircle02Icon} size={24} />,
				}}
				className="bg-success"
			/>,
			{
				...payload.opts,
				duration: payload.opts?.duration ?? payload.duration ?? DEFAULT_DURATION,
			},
		);
	}, []);
	const showWarningToast = useCallback((payload: Partial<DefaultToastPayload>) => {
		toast(
			<DefaultToast
				payload={{
					...payload,
					icon: payload.icon || <HugeiconsIcon icon={AlertCircleIcon} size={24} />,
				}}
				className="bg-orange-500"
			/>,
			{
				...payload.opts,
				duration: payload.opts?.duration ?? payload.duration ?? DEFAULT_DURATION,
			},
		);
	}, []);
	const showErrorToast = useCallback((payload: Partial<DefaultToastPayload>) => {
		toast(
			<DefaultToast
				payload={{
					...payload,
					icon: payload.icon || <HugeiconsIcon icon={AlertCircleIcon} size={24} />,
				}}
				className="bg-red-500"
			/>,
			{
				...payload.opts,
				duration: payload.opts?.duration ?? payload.duration ?? DEFAULT_DURATION,
			},
		);
	}, []);
	const showInfoToast = useCallback((payload: Partial<DefaultToastPayload>) => {
		toast(
			<DefaultToast
				payload={{
					...payload,
					icon: payload.icon || <HugeiconsIcon icon={InformationCircleIcon} size={24} />,
				}}
				className="bg-blue-500"
			/>,
			{
				...payload.opts,
				duration: payload.opts?.duration ?? payload.duration ?? DEFAULT_DURATION,
			},
		);
	}, []);

	useEffect(() => {
		const unsubs = [
			emitter.on("success", (payload) => showSuccessToast(payload)),
			emitter.on("warning", (payload) => showWarningToast(payload)),
			emitter.on("error", (payload) => showErrorToast(payload)),
			emitter.on("info", (payload) => showInfoToast(payload)),
		];

		return () => {
			unsubs.forEach((unsub) => unsub());
		};
	}, [showErrorToast, showInfoToast, showSuccessToast, showWarningToast]);

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			toastOptions={{
				unstyled: true,
				classNames: {
					toast: cn("p-0"),
					// 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
					description: cn(),
					// 'group-[.toast]:text-muted-foreground'
					actionButton: cn(),
					// 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
					cancelButton: cn(),
					// 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
				},
			}}
			{...props}
		/>
	);
};
