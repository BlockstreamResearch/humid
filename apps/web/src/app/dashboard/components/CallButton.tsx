import { Button } from "@/components/ui/button";

export function CallButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
	return (
		<Button onClick={onClick} disabled={disabled} className="w-fit">
			{disabled ? "Calling…" : "Call"}
		</Button>
	);
}
