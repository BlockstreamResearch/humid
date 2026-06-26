import * as React from "react";

import { cn } from "@/theme/utils.ts";

import { UiInput } from "./base";

export default function UiInputOutline({
	className,
	type,
	...props
}: React.ComponentProps<typeof UiInput>) {
	return (
		<UiInput
			type={type}
			data-slot="input"
			className={cn("bg-transparent!", className)}
			{...props}
		/>
	);
}
