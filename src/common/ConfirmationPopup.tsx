import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { UiButton } from "@/ui/UiButton/base";

type ConfirmContextType = {
	confirm: (title?: string, message?: string) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
	const [options, setOptions] = useState<{
		title?: string;
		message?: string;
	} | null>(null);
	const [resolver, setResolver] = useState<(value: boolean) => void>(() => () => {});

	const confirm = useCallback((title?: string, message?: string): Promise<boolean> => {
		setOptions({ title, message });

		return new Promise<boolean>((resolve) => {
			setResolver(() => resolve);
		});
	}, []);

	const handleConfirm = useCallback(() => {
		resolver(true);
		setOptions(null);
	}, [resolver]);

	const handleDecline = useCallback(() => {
		resolver(false);
		setOptions(null);
	}, [resolver]);

	const contextValue = useMemo(() => ({ confirm }), [confirm]);

	return (
		<ConfirmContext.Provider value={contextValue}>
			{children}
			{options &&
				createPortal(
					<ConfirmationPopup
						title={options.title}
						message={options.message}
						onConfirm={handleConfirm}
						onDecline={handleDecline}
					/>,
					document.body,
				)}
		</ConfirmContext.Provider>
	);
}

export function useConfirm(): (title?: string, message?: string) => Promise<boolean> {
	const context = useContext(ConfirmContext);

	if (!context) {
		throw new Error("useConfirm must be used within a ConfirmProvider");
	}

	return context.confirm;
}

type Props = {
	title?: string;
	message?: string;
	onConfirm: () => void;
	onDecline: () => void;
};

function ConfirmationPopup({ title, message, onConfirm, onDecline }: Props) {
	return (
		<div className="bg-background text-foreground fixed inset-0 z-50 flex flex-col items-center gap-2 p-4 text-center">
			{title && <h2 className="cn-font-heading mb-4 text-xl font-bold">{title}</h2>}
			{message && <p className="text-muted-foreground mb-6 text-sm leading-6">{message}</p>}
			<div className="mt-auto flex items-center gap-4">
				<UiButton type="button" variant="outline" onClick={onDecline}>
					Decline
				</UiButton>
				<UiButton type="button" onClick={onConfirm}>
					Confirm
				</UiButton>
			</div>
		</div>
	);
}
