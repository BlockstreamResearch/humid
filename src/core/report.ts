import { logger } from "./logger";

type ReportContext = Record<string, unknown>;

interface ReportOptions {
	context?: ReportContext;
	message?: string;
	module?: string;
}

let isGlobalErrorReportingInitialized = false;

function getScopedLogger(module?: string) {
	if (!module) {
		return logger;
	}

	return logger.child({ module });
}

export function getErrorMessage(error: unknown, fallback = "Unknown error") {
	if (error instanceof Error) {
		return error.message || fallback;
	}

	if (typeof error === "string") {
		return error;
	}

	return fallback;
}

export function ensureError(error: unknown, message: string) {
	if (error instanceof Error) {
		return error;
	}

	return new Error(message, {
		cause: error,
	});
}

export function reportWarning(message: string, options: ReportOptions = {}): void {
	const scopedLogger = getScopedLogger(options.module);

	scopedLogger.warn(message, options.context);
}

export function reportAppError(error: unknown, options: ReportOptions = {}): void {
	const message = options.message ?? getErrorMessage(error);
	const context = options.context ?? {};
	const scopedLogger = getScopedLogger(options.module);

	scopedLogger.error(message, ensureError(error, message), context);
}

export function initGlobalErrorReporting() {
	if (isGlobalErrorReportingInitialized || typeof window === "undefined") {
		return;
	}

	isGlobalErrorReportingInitialized = true;

	window.addEventListener("error", (event) => {
		reportAppError(event.error ?? event.message, {
			module: "window",
			message: "Unhandled window error",
			context: {
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
			},
		});
	});

	window.addEventListener("unhandledrejection", (event) => {
		reportAppError(event.reason, {
			module: "window",
			message: "Unhandled promise rejection",
		});
	});
}
