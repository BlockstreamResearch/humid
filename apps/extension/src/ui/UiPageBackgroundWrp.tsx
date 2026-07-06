import { PaperTexture } from "@paper-design/shaders-react";
import { ComponentProps } from "react";

import { useTheme } from "@/contexts/ThemeProvider";
import { cn } from "@/theme/utils";

export default function UiPageBackgroundWrp({
	className,
	children,
	...rest
}: ComponentProps<"div">) {
	const { systemTheme, theme } = useTheme();

	const computedTheme: "dark" | "light" = theme === "system" ? systemTheme : theme;

	return (
		<div {...rest} className={cn("relative isolate size-full min-h-0", className)}>
			<div className="absolute inset-0 z-10">
				<PaperTexture
					width={375 * 1.25}
					height={600 * 1.25}
					colorBack={computedTheme === "dark" ? "#000000" : "#ffffff"}
					colorFront={computedTheme === "dark" ? "#141414" : "#d9d9d9"}
					contrast={0.3}
					roughness={0.4}
					fiber={0.3}
					fiberSize={0.2}
					crumples={0.3}
					crumpleSize={0.35}
					folds={0.65}
					foldCount={5}
					drops={0.2}
					fade={0}
					seed={5.8}
					scale={0.6}
					fit="cover"
				/>
			</div>
			<div className="absolute z-20 size-full">{children}</div>
		</div>
	);
}
