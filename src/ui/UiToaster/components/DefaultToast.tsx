import { Alert02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cva } from "class-variance-authority";
import { type ComponentPropsWithoutRef, createContext, type ReactNode, useContext } from "react";

import { cn } from "@/theme/utils.ts";

import type { DefaultToastRenderPayload } from "..";

type DefaultToastBaseProps = ComponentPropsWithoutRef<"div">;

export type DefaultToastVariant = "success" | "warning" | "error" | "info";

type DefaultToastProps = DefaultToastBaseProps & {
	variant?: DefaultToastVariant;
	payload: DefaultToastRenderPayload;
};

const DEFAULT_TOAST_VARIANT = "info" as const;
const DefaultToastVariantContext = createContext<DefaultToastVariant>(DEFAULT_TOAST_VARIANT);

type DefaultToastVariantProps = {
	variant?: DefaultToastVariant;
};

const defaultToastHeaderVariants = cva(
	"text-foreground flex min-w-80 items-center gap-4 rounded-xl p-4",
	{
		variants: {
			variant: {
				success: "border-2 border-[#90D24F] bg-[#90D24F]/20",
				warning: "border-2 border-[#FFE500] bg-[#FFE500]/20",
				error: "border-2 border-[#F14725] bg-[#F14725]/20",
				info: "border-2 border-[#0066FF] bg-[#0066FF]/20",
			},
		},
		defaultVariants: {
			variant: DEFAULT_TOAST_VARIANT,
		},
	},
);

const defaultToastIconVariants = cva("size-6", {
	variants: {
		variant: {
			success: "text-[#90D24F]",
			warning: "text-[#FFE500]",
			error: "text-[#F14725]",
			info: "text-[#0066FF]",
		},
	},
	defaultVariants: {
		variant: DEFAULT_TOAST_VARIANT,
	},
});

const defaultToastTitleVariants = cva("typography-m3-title-small font-semibold", {
	variants: {
		variant: {
			success: "text-foreground",
			warning: "text-foreground",
			error: "text-foreground",
			info: "text-foreground",
		},
	},
	defaultVariants: {
		variant: DEFAULT_TOAST_VARIANT,
	},
});

const defaultToastDescriptionVariants = cva("typography-m3-body-small line-clamp-5", {
	variants: {
		variant: {
			success: "text-foreground",
			warning: "text-foreground",
			error: "text-foreground",
			info: "text-foreground",
		},
	},
	defaultVariants: {
		variant: DEFAULT_TOAST_VARIANT,
	},
});

const iconFallbackByVariant: Record<DefaultToastVariant, ReactNode> = {
	success: <HugeiconsIcon icon={InformationCircleIcon} size={24} className="text-[#90D24F]" />,
	warning: <HugeiconsIcon icon={InformationCircleIcon} size={24} className="text-[#FFE500]" />,
	error: <HugeiconsIcon icon={Alert02Icon} size={24} className="text-[#F14725]" />,
	info: <HugeiconsIcon icon={InformationCircleIcon} size={24} className="text-[#0066FF]" />,
};

function useDefaultToastVariant(variant?: DefaultToastVariant) {
	const contextVariant = useContext(DefaultToastVariantContext);

	return variant ?? contextVariant;
}

type DefaultToastContainerProps = DefaultToastBaseProps & DefaultToastVariantProps;

function DefaultToastContainer({
	variant = DEFAULT_TOAST_VARIANT,
	className,
	...props
}: DefaultToastContainerProps) {
	return (
		<DefaultToastVariantContext.Provider value={variant}>
			<div
				data-slot="toast-container"
				data-variant={variant}
				className={cn("overflow-hidden rounded-xl bg-white", className)}
				{...props}
			/>
		</DefaultToastVariantContext.Provider>
	);
}

type DefaultToastHeaderProps = DefaultToastBaseProps & DefaultToastVariantProps;

function DefaultToastHeader({
	variant: variantProp,
	className,
	...props
}: DefaultToastHeaderProps) {
	const variant = useDefaultToastVariant(variantProp);

	return (
		<div
			data-slot="toast-header"
			data-variant={variant}
			className={cn(defaultToastHeaderVariants({ variant }), className)}
			{...props}
		/>
	);
}

function DefaultToastIcon({
	variant: variantProp,
	className,
	children,
	...props
}: DefaultToastBaseProps & DefaultToastVariantProps) {
	const variant = useDefaultToastVariant(variantProp);

	return (
		<div
			data-slot="toast-icon"
			data-variant={variant}
			className={cn(defaultToastIconVariants({ variant }), className)}
			{...props}
		>
			{children ?? iconFallbackByVariant[variant] ?? (
				<HugeiconsIcon
					icon={InformationCircleIcon}
					className="aspect-square size-6 text-inherit"
					size={24}
				/>
			)}
		</div>
	);
}

function DefaultToastContent({
	variant: variantProp,
	className,
	...props
}: DefaultToastBaseProps & DefaultToastVariantProps) {
	const variant = useDefaultToastVariant(variantProp);

	return (
		<div
			data-slot="toast-content"
			data-variant={variant}
			className={cn("flex flex-1 flex-col justify-center self-center", className)}
			{...props}
		/>
	);
}

function DefaultToastTitle({
	variant: variantProp,
	className,
	...props
}: ComponentPropsWithoutRef<"h5"> & DefaultToastVariantProps) {
	const variant = useDefaultToastVariant(variantProp);

	return (
		<h5
			data-slot="toast-title"
			data-variant={variant}
			className={cn(defaultToastTitleVariants({ variant }), className)}
			{...props}
		/>
	);
}

function DefaultToastDescription({
	variant: variantProp,
	className,
	...props
}: ComponentPropsWithoutRef<"p"> & DefaultToastVariantProps) {
	const variant = useDefaultToastVariant(variantProp);

	return (
		<p
			data-slot="toast-description"
			data-variant={variant}
			className={cn(defaultToastDescriptionVariants({ variant }), className)}
			{...props}
		/>
	);
}

function DefaultToastMessage({
	variant,
	...props
}: ComponentPropsWithoutRef<"p"> & DefaultToastVariantProps) {
	return <DefaultToastDescription data-slot="toast-message" variant={variant} {...props} />;
}

function DefaultToast({
	payload,
	variant = DEFAULT_TOAST_VARIANT,
	className,
	...rest
}: DefaultToastProps) {
	return (
		<DefaultToastContainer variant={variant}>
			<DefaultToastHeader {...rest} className={className}>
				<DefaultToastIcon>{payload.icon}</DefaultToastIcon>

				<DefaultToastContent>
					{payload.title && <DefaultToastTitle>{payload.title}</DefaultToastTitle>}

					{payload.message && <DefaultToastMessage>{payload.message}</DefaultToastMessage>}
				</DefaultToastContent>
			</DefaultToastHeader>
		</DefaultToastContainer>
	);
}

export {
	DefaultToast,
	DefaultToastContainer,
	DefaultToastContent,
	DefaultToastDescription,
	DefaultToastHeader,
	DefaultToastIcon,
	DefaultToastMessage,
	DefaultToastTitle,
};
