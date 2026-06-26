import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import React, { type ReactNode } from "react";
import { type FieldValues, useController, type UseControllerProps } from "react-hook-form";
import { v4 } from "uuid";

import { UiCollapsible } from "../UiCollapsible";
import { UiLabel } from "../UiLabel";
import { UiInput } from "./base";

export type ControlledUiInputProps<T extends FieldValues> = useRender.ComponentProps<
	typeof UiInput
> & {
	label?: ReactNode;
	leadingContent?: ReactNode;
	trailingContent?: ReactNode;
} & UseControllerProps<T>;

export default function ControlledUiInput<T extends FieldValues>({
	name,
	control,
	rules,
	label,
	leadingContent,
	trailingContent,

	render,
	...rest
}: ControlledUiInputProps<T>) {
	const id = React.useMemo(() => v4(), []);
	const { field, fieldState } = useController({ control, name, rules: rules });
	const { onChange, ...inputProps } = rest;
	const input = useRender({
		defaultTagName: "input",
		props: mergeProps<"input">(inputProps, {
			id,
			autoCapitalize: "none",
			onChange: (e) => {
				onChange?.(e);
				field.onChange(e);
			},
			value: field.value,
		}),
		ref: field.ref,
		render: render ?? <UiInput />,
		state: {
			slot: "input",
		},
	});

	return (
		<div className="flex flex-col items-start">
			{label && (
				<UiLabel htmlFor={id} className="mb-2">
					{label}
				</UiLabel>
			)}
			<div className="relative isolate flex w-full">
				{leadingContent}
				{input}
				{trailingContent}
			</div>

			<UiCollapsible open={!!fieldState.error?.message} className="w-full">
				<span className="text-destructive typography-m3-body-small mt-2">
					{fieldState.error?.message}
				</span>
			</UiCollapsible>
		</div>
	);
}
