import { cn } from "@/lib/utils";

/** FNV-1a hash of the seed → a stable 32-bit number the avatar derives its colors and angle from. */
function hashSeed(seed: string): number {
	let hash = 2166136261;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/**
 * Deterministic gradient avatar seeded by a string (identity public key, else address). No dependency:
 * the same wallet always renders the same "signed in as" mark, so identity feels personal and stable.
 */
export function IdentityAvatar({ seed, className }: { seed: string; className?: string }) {
	const hash = hashSeed(seed || "humid");
	const hueA = hash % 360;
	const hueB = (hueA + 40 + (hash % 140)) % 360;
	const angle = (hash >> 3) % 360;

	return (
		<div
			data-slot="identity-avatar"
			aria-hidden="true"
			className={cn("size-12 shrink-0 rounded-full ring-1 ring-foreground/15", className)}
			style={{
				backgroundImage: `linear-gradient(${angle}deg, oklch(0.72 0.16 ${hueA}) 0%, oklch(0.52 0.2 ${hueB}) 100%)`,
			}}
		/>
	);
}
