import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export function TextField({
	label,
	onChange,
	placeholder,
	value,
}: {
	label: string;
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
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className="font-mono text-xs"
			/>
		</div>
	);
}

export function TextAreaField({
	label,
	onChange,
	placeholder,
	value,
}: {
	label: string;
	onChange: (value: string) => void;
	placeholder?: string;
	value: string;
}) {
	const id = useId();

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<textarea
				id={id}
				className="border-input bg-background focus-visible:ring-ring min-h-24 w-full resize-y rounded-md border px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				spellCheck={false}
			/>
		</div>
	);
}

export function SelectField({
	label,
	onValueChange,
	options,
	value,
}: {
	label: string;
	onValueChange: (value: string) => void;
	options: string[];
	value: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label>{label}</Label>
			<Select value={value} onValueChange={onValueChange}>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option} value={option}>
							{option}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function CheckboxField({
	checked,
	label,
	onChange,
}: {
	checked: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}) {
	const id = useId();

	return (
		<div className="flex items-center gap-2">
			<Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
			<Label htmlFor={id}>{label}</Label>
		</div>
	);
}
