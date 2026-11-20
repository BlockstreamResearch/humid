import { Link } from "@tanstack/react-router";

import { IN_TAB, openInTab } from "@/helpers/surface";
import { UiButtonVariants } from "@/ui/UiButton/base";

import humidMark from "../../../../../../../assets/brand/humid-mark.svg";

export function AuthIntroPage() {
	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<div className="flex flex-1 flex-col items-center gap-3 pt-10 text-center">
				<img alt="Humid" className="mb-4 h-28" src={humidMark} />
				<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Welcome to Humid</h1>
				<p className="text-muted-foreground text-sm leading-6 text-balance">
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
