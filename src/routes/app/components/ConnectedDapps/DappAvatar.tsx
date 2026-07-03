import { cn } from "@/theme/utils.ts";
import { UiAvatar } from "@/ui/UiAvatar";

function hueFromSeed(seed: string) {
	let hash = 0;

	for (let index = 0; index < seed.length; index += 1) {
		hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0;
	}

	return Math.abs(hash) % 360;
}

/**
 * Deterministic gradient avatar for a connected dapp, seeded by its origin / url. A placeholder
 * identicon (no remote image) that stays stable per dapp — mirrors AccountAvatar.
 *
 * TODO(nice-to-have): render the dapp's real icon with this gradient as the fallback — the
 * WalletConnect peer icon (ConnectedDappView.iconUrl) when present, and the injected origin's
 * favicon (e.g. `https://<host>/favicon.ico`).
 */
export function DappAvatar({ className, seed }: { className?: string; seed: string }) {
	const hue = hueFromSeed(seed);

	return (
		<UiAvatar className={cn("size-8", className)}>
			<span
				className="size-full rounded-full"
				style={{
					backgroundImage: `linear-gradient(135deg, hsl(${hue} 65% 52%), hsl(${(hue + 50) % 360} 65% 42%))`,
				}}
			/>
		</UiAvatar>
	);
}
