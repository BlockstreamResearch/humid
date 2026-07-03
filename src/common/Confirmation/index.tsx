import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { ConfirmationDecision, ConfirmationRequest } from "@/helpers/background";

import { DefaultConfirmation } from "./DefaultConfirmation";

/** Show a confirmation and resolve the user's decision (approval + optional result). */
type Confirm = (request: ConfirmationRequest) => Promise<ConfirmationDecision>;

/**
 * A bespoke confirmation body plugged into the host. The method (in core) picks the
 * `kind` via its confirmation data and owns the matching UI; that UI provides a
 * renderer, which the entrypoint passes to {@link ConfirmProvider}. The host stays
 * generic and knows about no specific confirmation.
 */
export type ConfirmationRenderer = {
	kind: string;
	render: (props: {
		onConfirm: (result?: unknown) => void;
		onDecline: () => void;
		request: ConfirmationRequest;
	}) => ReactNode;
};

const ConfirmContext = createContext<Confirm | undefined>(undefined);

export function ConfirmProvider({
	children,
	renderers = [],
}: {
	children: ReactNode;
	renderers?: ConfirmationRenderer[];
}) {
	const [request, setRequest] = useState<ConfirmationRequest | null>(null);
	const [resolver, setResolver] = useState<(decision: ConfirmationDecision) => void>(
		() => () => {},
	);

	const confirm = useCallback<Confirm>((next) => {
		setRequest(next);

		return new Promise<ConfirmationDecision>((resolve) => {
			setResolver(() => resolve);
		});
	}, []);

	const settle = useCallback(
		(decision: ConfirmationDecision) => {
			resolver(decision);
			setRequest(null);
		},
		[resolver],
	);

	const bodies = useMemo(
		() => new Map(renderers.map((renderer) => [renderer.kind, renderer.render])),
		[renderers],
	);

	const Body = request ? (bodies.get(confirmationKind(request.data)) ?? DefaultConfirmation) : null;

	return (
		<ConfirmContext.Provider value={confirm}>
			{children}
			{request &&
				Body &&
				createPortal(
					<div className="fixed inset-0 z-50">
						<Body
							request={request}
							onConfirm={(result) => settle({ approved: true, result })}
							onDecline={() => settle({ approved: false })}
						/>
					</div>,
					document.body,
				)}
		</ConfirmContext.Provider>
	);
}

export function useConfirm(): Confirm {
	const confirm = useContext(ConfirmContext);

	if (!confirm) {
		throw new Error("useConfirm must be used within a ConfirmProvider");
	}

	return confirm;
}

function confirmationKind(data: unknown): string {
	if (typeof data === "object" && data !== null) {
		const { kind } = data as { kind?: unknown };

		if (typeof kind === "string") return kind;
	}

	return "";
}
