import { CheckIcon, CopyIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** A labeled single-line input for the overlay forms. */
export function TextField({
	disabled,
	hint,
	label,
	mono = true,
	onChange,
	placeholder,
	value,
}: {
	disabled?: boolean;
	hint?: string;
	label: string;
	mono?: boolean;
	onChange: (value: string) => void;
	placeholder?: string;
	value: string;
}) {
	const id = useId();

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				value={value}
				disabled={disabled}
				placeholder={placeholder}
				onChange={(event) => onChange(event.target.value)}
				className={mono ? "font-mono text-xs" : undefined}
			/>
			{hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
		</div>
	);
}

/** A labeled multi-line input for the overlay forms. */
export function TextAreaField({
	disabled,
	hint,
	label,
	onChange,
	placeholder,
	value,
}: {
	disabled?: boolean;
	hint?: string;
	label: string;
	onChange: (value: string) => void;
	placeholder?: string;
	value: string;
}) {
	const id = useId();

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Textarea
				id={id}
				value={value}
				disabled={disabled}
				placeholder={placeholder}
				spellCheck={false}
				onChange={(event) => onChange(event.target.value)}
				className="min-h-24 font-mono text-xs"
			/>
			{hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
		</div>
	);
}

/** A read-only, copyable result row (signature, txid, public key). */
export function ResultField({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			toast.success(`${label} copied`);
			window.setTimeout(() => setCopied(false), 1200);
		} catch {
			toast.error("Couldn't copy to clipboard");
		}
	};

	return (
		<div className="border-border bg-muted/40 flex flex-col gap-1.5 rounded-md border p-3">
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-xs font-medium">{label}</span>
				<Button type="button" variant="ghost" size="icon-xs" onClick={copy}>
					{copied ? <CheckIcon /> : <CopyIcon />}
					<span className="sr-only">Copy {label}</span>
				</Button>
			</div>
			<code className="text-foreground text-xs break-all">{value}</code>
		</div>
	);
}

/** A label / value line for the transfer review step. */
export function ReviewRow({
	label,
	value,
	mono,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-start justify-between gap-4 py-2">
			<span className="text-muted-foreground text-sm">{label}</span>
			<span
				className={`max-w-[60%] text-right text-sm break-all ${mono ? "font-mono text-xs" : ""}`}
			>
				{value}
			</span>
		</div>
	);
}
