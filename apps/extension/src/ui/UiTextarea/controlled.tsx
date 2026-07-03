import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { type ReactNode, useMemo } from "react";
import { type FieldValues, useController, type UseControllerProps } from "react-hook-form";
import { v4 } from "uuid";

import { UiLabel } from "../UiLabel";
import { UiTextarea } from "./base";

export type ControlledInputProps<T extends FieldValues> = useRender.ComponentProps<
	typeof UiTextarea
> & {
	label?: ReactNode;
	leadingContent?: ReactNode;
	trailingContent?: ReactNode;
} & UseControllerProps<T>;

export default function ControlledUiTextarea<T extends FieldValues>({
	name,
	control,
	rules,
	label,
	leadingContent,
	trailingContent,
	render,
	...rest
}: ControlledInputProps<T>) {
	const id = useMemo(() => v4(), []);
	const { field, fieldState } = useController({ control, name, rules: rules });
	const { onChange, disabled, ...textareaProps } = rest;
	const textarea = useRender({
		defaultTagName: "textarea",
		props: mergeProps<"textarea">(textareaProps, {
			id,
			disabled: field.disabled || disabled,
			autoCapitalize: "none",
			onChange: (e) => {
				onChange?.(e);
				field.onChange(e);
			},
			value: field.value,
		}),
		ref: field.ref,
		render: render ?? <UiTextarea />,
		state: {
			slot: "textarea",
		},
	});

	return (
		<div className="flex flex-col items-start gap-2">
			{label && <UiLabel htmlFor={id}>{label}</UiLabel>}
			<div className="relative isolate flex w-full">
				{leadingContent}
				{textarea}
				{trailingContent}
			</div>
			{fieldState.error?.message && (
				<span className="text-destructive typography-m3-body-small">
					{fieldState.error.message}
				</span>
			)}
		</div>
	);
}
