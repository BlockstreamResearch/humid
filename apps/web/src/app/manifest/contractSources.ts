/** One contract source a person handed to this page, under the name it had on their disk. */
export type SuppliedSource = {
	name: string;
	text: string;
};

export type MatchedSources = {
	/** What the reader is given: sources under the paths the document references them by. */
	sources: Record<string, string>;
	/** Names that matched nothing this document references, which is worth saying rather than ignoring. */
	unmatched: string[];
};

/**
 * Puts supplied files under the paths the document references them by.
 *
 * A document references a contract by a path relative to itself — `./p2pk.simf` — and a person
 * has a file, not a path. Matching on the name at the end of the path is what closes that gap
 * without asking anyone to retype a path they can read on screen.
 *
 * It matches rather than guesses: a file the document does not reference goes to `unmatched`
 * and reaches the reader under no path at all. Handing it over under an invented key would put
 * a source into a check that nothing in the document asked for.
 */
export function matchContractSources(
	referenced: readonly string[],
	supplied: readonly SuppliedSource[],
): MatchedSources {
	const sources: Record<string, string> = {};
	const unmatched: string[] = [];

	for (const file of supplied) {
		const path = referenced.find((candidate) => endsWithName(candidate, file.name));

		if (path === undefined) {
			unmatched.push(file.name);
			continue;
		}

		sources[path] = file.text;
	}

	return { sources, unmatched };
}

function endsWithName(path: string, name: string): boolean {
	return path === name || path.endsWith(`/${name}`);
}
