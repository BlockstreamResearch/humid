/**
 * What a browser will accept as an extension's version, derived from the package's semver.
 *
 * Chrome and Firefox both require `version` to be one to four dot-separated integers, so a
 * pre-release like `1.1.0-rc.0` cannot be handed over as it stands — the extension simply fails
 * to load. The numeric core goes in as the version, the pre-release counter becomes a fourth
 * component so successive candidates differ, and the semver string itself is published as
 * `version_name`, which is free-form and is what Chrome shows wherever it shows a version.
 *
 * `version_name` is Chrome's alone; Firefox has no equivalent, which is why it is emitted under
 * the `{{chrome}}.` prefix the manifest template uses for browser-specific keys.
 */
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
