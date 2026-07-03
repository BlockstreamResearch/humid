import * as React from "react";

import { cn } from "@/theme/utils.ts";

import { UiTextarea } from "./base";

export default function UiTextareaOutline({
	className,
	...props
}: React.ComponentProps<typeof UiTextarea>) {
	return (
		<UiTextarea data-slot="textarea" className={cn("bg-transparent!", className)} {...props} />
	);
}
