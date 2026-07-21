import { Badge } from "@/components/ui/badge";

export function StatusRow({
	active,
	label,
	value,
}: {
	active?: boolean;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-muted-foreground">{label}:</span>
			<Badge variant={active ? "default" : "secondary"}>{value}</Badge>
		</div>
	);
}
