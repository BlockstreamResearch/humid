export type SuppliedSource = {
	name: string;
	text: string;
};

export type MatchedSources = {
	sources: Record<string, string>;
	unmatched: string[];
};

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
