export function manifestVersion(version: string): Record<string, string> {
	const [core, ...prerelease] = version.split("-");

	if (!/^\d+(\.\d+){0,3}$/.test(core)) {
		throw new Error(
			`Cannot derive a manifest version from "${version}": "${core}" is not one to four dot-separated integers.`,
		);
	}

	if (prerelease.length === 0) {
		return { version: core };
	}

	const counter = prerelease.join("-").match(/(\d+)$/)?.[1];
	if (counter === undefined) {
		throw new Error(
			`Cannot derive a manifest version from "${version}": the pre-release "${prerelease.join("-")}" ends in no number, so two candidates would carry the same version.`,
		);
	}

	if (core.split(".").length > 3) {
		throw new Error(
			`Cannot derive a manifest version from "${version}": "${core}" already uses four components, leaving nowhere for the pre-release counter.`,
		);
	}

	return { version: `${core}.${counter}`, "{{chrome}}.version_name": version };
}
