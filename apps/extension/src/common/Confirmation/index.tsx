import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type {
	ConfirmationDecision,
	ConfirmationOutcome,
	ConfirmationRequest,
} from "@/helpers/background";

import { DefaultConfirmation } from "./DefaultConfirmation";
import { ConfirmationFailure, TransactionReceipt } from "./TransactionReceipt";

type Confirm = (request: ConfirmationRequest) => Promise<ConfirmationDecision>;

type ShowOutcome = (outcome: ConfirmationOutcome) => Promise<void>;

export type ConfirmationRenderer = {
	kind: string;
	render: (props: {
		busy: boolean;
		onConfirm: (result?: unknown) => void;
		onDecline: () => void;
		request: ConfirmationRequest;
	}) => ReactNode;
};

type View = {
	busy: boolean;
	outcome?: ConfirmationOutcome;
	request: ConfirmationRequest;
};

const ConfirmContext = createContext<{ confirm: Confirm; showOutcome: ShowOutcome } | undefined>(
	undefined,
);

export function ConfirmProvider({
	children,
	renderers = [],
}: {
	children: ReactNode;
	renderers?: ConfirmationRenderer[];
}) {
	const [view, setView] = useState<View | null>(null);
	const [resolver, setResolver] = useState<(decision: ConfirmationDecision) => void>(
		() => () => {},
	);
	const [dismiss, setDismiss] = useState<() => void>(() => () => {});

	const confirm = useCallback<Confirm>((request) => {
		setView({ busy: false, request });

		return new Promise<ConfirmationDecision>((resolve) => {
			setResolver(() => resolve);
		});
	}, []);

	const showOutcome = useCallback<ShowOutcome>((outcome) => {
		setView((current) => current && { ...current, outcome });

		return new Promise<void>((resolve) => {
			setDismiss(() => resolve);
		});
	}, []);

	const settle = useCallback(
		(decision: ConfirmationDecision) => {
			resolver(decision);
			setView((current) =>
				decision.approved && current?.request.completes ? { ...current, busy: true } : null,
			);
		},
		[resolver],
	);

	const done = () => {
		dismiss();
		setView(null);
		window.close();
	};

	const bodies = useMemo(
		() => new Map(renderers.map((renderer) => [renderer.kind, renderer.render])),
		[renderers],
	);

	const context = useMemo(() => ({ confirm, showOutcome }), [confirm, showOutcome]);

	return (
		<ConfirmContext.Provider value={context}>
			{children}
			{view &&
				createPortal(
					<div className="fixed inset-0 z-50">
						<ConfirmationView
							view={view}
							Body={bodies.get(confirmationKind(view.request.data)) ?? DefaultConfirmation}
							onConfirm={(result) => settle({ approved: true, result })}
							onDecline={() => settle({ approved: false })}
							onDone={done}
						/>
					</div>,
					document.body,
				)}
		</ConfirmContext.Provider>
	);
}

function ConfirmationView({
	view: { busy, outcome, request },
	Body,
	onConfirm,
	onDecline,
	onDone,
}: {
	view: View;
	Body: ConfirmationRenderer["render"];
	onConfirm: (result?: unknown) => void;
	onDecline: () => void;
	onDone: () => void;
}) {
	const origin = request.requester?.origin;

	if (outcome === undefined) {
		return <Body busy={busy} request={request} onConfirm={onConfirm} onDecline={onDecline} />;
	}

	return "receipt" in outcome ? (
		<TransactionReceipt receipt={outcome.receipt} origin={origin} onDone={onDone} />
	) : (
		<ConfirmationFailure message={outcome.error} origin={origin} onClose={onDone} />
	);
}

export function useConfirm(): Confirm {
	return useConfirmContext().confirm;
}

export function useShowOutcome(): ShowOutcome {
	return useConfirmContext().showOutcome;
}

function useConfirmContext() {
	const context = useContext(ConfirmContext);

	if (!context) {
		throw new Error("useConfirm must be used within a ConfirmProvider");
	}

	return context;
}

function confirmationKind(data: unknown): string {
	if (typeof data === "object" && data !== null) {
		const { kind } = data as { kind?: unknown };

		if (typeof kind === "string") return kind;
	}

	return "";
}
