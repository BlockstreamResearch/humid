import { Link } from "@tanstack/react-router";

import { UiButtonVariants } from "@/ui/UiButton/base";

export function AuthIntroPage() {
	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<div className="flex flex-1 flex-col justify-center gap-3">
				<p className="text-muted-foreground text-xs font-medium tracking-normal uppercase">
					Unauthorized
				</p>
				<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Welcome to Humid</h1>
				<p className="text-muted-foreground text-sm leading-6">
					Create a local vault to enter the app area.
				</p>
			</div>

			<Link className={UiButtonVariants({ size: "lg" })} to="/auth/create">
				Create vault
			</Link>
		</main>
	);
}
