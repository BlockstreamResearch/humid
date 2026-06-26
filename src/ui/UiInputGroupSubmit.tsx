import { type ComponentProps, createContext, use, useState } from "react";

import { UiButton } from "./UiButton/base";
import { UiInputGroup, UiInputGroupInput } from "./UiInputGroup";

const context = createContext<{
	value: string;
	onValueChange: (v: string) => void;

	submitValue: () => void;

	disabled?: boolean;
}>({
	value: "",
	onValueChange: () => {
		throw new Error("Not implemented");
	},
	submitValue: () => {
		throw new Error("Not implemented");
	},
});

const useContext = () => {
	const ctx = use(context);
	return ctx;
};

function UiInputGroupSubmit(
	props: {
		value?: string;
		onValueChange?: (v: string) => void;

		disabled?: boolean;
	} & ComponentProps<typeof UiInputGroup>,
) {
	const [internalValue, setInternalValue] = useState(props.value ?? "");

	const submitValue = () => {
		props.onValueChange?.(internalValue);
		setInternalValue("");
	};

	return (
		<context.Provider
			value={{
				value: internalValue,
				onValueChange: setInternalValue,
				submitValue,

				disabled: props.disabled,
			}}
		>
			<UiInputGroup {...props} />
		</context.Provider>
	);
}

function UiInputGroupSubmitInput(
	props: Omit<ComponentProps<typeof UiInputGroupInput>, "onChange" | "value">,
) {
	const { value, onValueChange } = useContext();
	return (
		<UiInputGroupInput {...props} value={value} onChange={(e) => onValueChange(e.target.value)} />
	);
}

function UiInputGroupSubmitTrigger(props: Omit<ComponentProps<typeof UiButton>, "onClick">) {
	const { submitValue } = useContext();

	return <UiButton type="button" {...props} onClick={submitValue} />;
}

export { UiInputGroupSubmit, UiInputGroupSubmitInput, UiInputGroupSubmitTrigger };
