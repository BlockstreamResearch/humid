import { cn } from "@/theme/utils.ts";
import { UiAvatar } from "@/ui/UiAvatar";

function hueFromSeed(seed: string) {
	let hash = 0;

	for (let index = 0; index < seed.length; index += 1) {
		hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0;
	}

	return Math.abs(hash) % 360;
}

export function AccountAvatar({ className, seed }: { className?: string; seed: string }) {
	const hue = hueFromSeed(seed);

	return (
		<UiAvatar className={cn("size-8", className)}>
			<span
				className="size-full rounded-full"
				style={{
					backgroundImage: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 60) % 360} 70% 45%))`,
				}}
			/>
		</UiAvatar>
	);
}
