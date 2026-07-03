import type { ReactNode } from "react";

import { emitter } from "./event-bus";
import { reportAppError } from "./report";

type ErrorToastKind = "error" | "warning";

interface ErrorFeedback {
	content: ReactNode;
	duration?: number;
	kind: ErrorToastKind;
}

interface ShowErrorOptions {
	context?: Record<string, unknown>;
	fallbackMessage?: ReactNode;
	module?: string;
	report?: boolean;
}

const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";

export function getErrorFeedback(error: unknown): ErrorFeedback {
	if (error instanceof Error) {
		return {
			kind: "error",
			content: error.message || DEFAULT_ERROR_MESSAGE,
		};
	}

	return {
		kind: "error",
		content: DEFAULT_ERROR_MESSAGE,
	};
}

export function showSuccess(message: ReactNode, duration?: number): void {
	emitter.emit("success", { message, opts: { duration } });
}

export function showInfo(message: ReactNode, duration?: number): void {
	emitter.emit("info", { message, opts: { duration } });
}

export function showWarning(message: ReactNode, duration?: number): void {
	emitter.emit("warning", { message, opts: { duration } });
}

export function showError(error: unknown, options: ShowErrorOptions = {}): void {
	const feedback = getErrorFeedback(error);
	const message = options.fallbackMessage ?? feedback.content;

	emitter.emit(feedback.kind, {
		message,
		opts: { duration: feedback.duration },
	});

	if (options.report === true) {
		reportAppError(error, {
			module: options.module,
			context: options.context,
		});
	}
}
