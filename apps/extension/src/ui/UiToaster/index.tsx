"use client";

import { CircleCheck, Info, Loader, OctagonXFreeIcons, Triangle } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useCallback, useEffect } from "react";
import { type ExternalToast, toast, Toaster as Sonner } from "sonner";

import { useTheme } from "@/contexts/ThemeProvider";
import { emitter } from "@/core/event-bus";

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

const isToastPayloadWithCustomChildren = (
	payload: DefaultToastPayload,
): payload is ToastPayloadWithCustomChildren & { opts?: ExternalToast } => {
	return "children" in payload;
};

export const UiToaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	const showSuccessToast = useCallback((payload: DefaultToastPayload) => {
		if (isToastPayloadWithCustomChildren(payload)) {
			toast(payload.children, payload.opts);

			return;
		}

		toast.success(payload.title, {
			...payload.opts,
			description: payload.message,
			icon: payload.icon,
			duration: payload.opts?.duration ?? payload.duration ?? DEFAULT_DURATION,
		});
	}, []);
	const showWarningToast = useCallback((payload: DefaultToastPayload) => {
		if (isToastPayloadWithCustomChildren(payload)) {
			toast(payload.children, payload.opts);

			return;
		}

		toast.warning(payload.title, {
			...payload.opts,
			description: payload.message,
			icon: payload.icon,
			duration: payload.opts?.duration ?? payload.duration ?? DEFAULT_DURATION,
		});
	}, []);
	const showErrorToast = useCallback((payload: DefaultToastPayload) => {
		if (isToastPayloadWithCustomChildren(payload)) {
			toast(payload.children, payload.opts);

			return;
		}

		toast.success(payload.title, {
			...payload.opts,
			description: payload.message,
			icon: payload.icon,
			duration: payload.opts?.duration ?? payload.duration ?? DEFAULT_DURATION,
		});
	}, []);
	const showInfoToast = useCallback((payload: DefaultToastPayload) => {
		if (isToastPayloadWithCustomChildren(payload)) {
			toast(payload.children, payload.opts);

			return;
		}

		toast.info(payload.title, {
			...payload.opts,
			description: payload.message,
			icon: payload.icon,
			duration: payload.opts?.duration ?? payload.duration ?? DEFAULT_DURATION,
		});
	}, []);

	useEffect(() => {
		const unsubs = [
			emitter.on("success", (event) => showSuccessToast(event)),
			emitter.on("warning", (event) => showWarningToast(event)),
			emitter.on("error", (event) => showErrorToast(event)),
			emitter.on("info", (event) => showInfoToast(event)),
		];

		return () => {
			unsubs.forEach((unsub) => unsub());
		};
	}, [showErrorToast, showInfoToast, showSuccessToast, showWarningToast]);

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			icons={{
				success: <HugeiconsIcon icon={CircleCheck} className="size-4" />,
				info: <HugeiconsIcon icon={Info} className="size-4" />,
				warning: <HugeiconsIcon icon={Triangle} className="size-4" />,
				error: <HugeiconsIcon icon={OctagonXFreeIcons} className="size-4" />,
				loading: <HugeiconsIcon icon={Loader} className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	);
};
