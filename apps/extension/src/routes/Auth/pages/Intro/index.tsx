import { Link } from "@tanstack/react-router";

import { IN_TAB, openInTab } from "@/helpers/surface";
import { UiButtonVariants } from "@/ui/UiButton/base";

export function AuthIntroPage() {
	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<div className="flex flex-1 flex-col justify-center gap-3">
				<p className="text-muted-foreground text-xs font-medium tracking-normal uppercase">
					Get started
				</p>
				<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Welcome to Humid</h1>
				<p className="text-muted-foreground text-sm leading-6">
					Create a new wallet or import one from a recovery phrase.
				</p>
			</div>

			<Link
				className={UiButtonVariants({ size: "lg" })}
				to="/auth/create"
				onClick={(event) => {
					if (IN_TAB) return;

					event.preventDefault();
					openInTab("/auth/create");
				}}
			>
				Create wallet
			</Link>
		</main>
	);
}
