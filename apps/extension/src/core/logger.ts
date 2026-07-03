// oxlint-disable no-console

type LogContext = Record<string, unknown>;

export interface Logger {
	debug(message: string, context?: LogContext): void;
	info(message: string, context?: LogContext): void;
	warn(message: string, context?: LogContext): void;
	error(message: string, error?: unknown, context?: LogContext): void;
	child(tags: LogContext): Logger;
}

function getErrorDetails(error: unknown) {
	if (!(error instanceof Error)) {
		return undefined;
	}

	const apiError = error as { details?: unknown };

	return apiError.details != null ? JSON.stringify(apiError.details, null, 2) : undefined;
}

function logErrorTrace(error: Error) {
	console.group(
		`%c${`${error.name}: ${error.message}`}`,
		"color: #dd9ab5; background-color: #4b2f36",
	);
	console.error(error.stack ?? `${error.name}: ${error.message}`);

	let cause = error.cause;

	while (cause instanceof Error) {
		console.error("caused by:", cause);
		cause = cause.cause;
	}

	console.groupEnd();
}

function createLogger(tags: LogContext = {}): Logger {
	return {
		debug(message, context) {
			if (import.meta.env.DEV) {
				console.log("[DEBUG]", message, { ...tags, ...context });
			}
		},

		info(message, context) {
			if (import.meta.env.DEV) {
				console.info("[INFO]", message, { ...tags, ...context });
			}
		},

		warn(message, context) {
			console.warn(message, { ...tags, ...context });
		},

		error(message, error, context) {
			const details = getErrorDetails(error);

			console.group(`%c${message}`, "color: #dd9ab5; background-color: #4b2f36");
			console.error(message, {
				...tags,
				...context,
				...(details != null ? { details } : {}),
			});

			if (error instanceof Error) {
				logErrorTrace(error);
			} else if (error !== undefined) {
				console.error(error);
			}

			console.groupEnd();
		},

		child(childTags) {
			return createLogger({ ...tags, ...childTags });
		},
	};
}

export const logger = createLogger();
