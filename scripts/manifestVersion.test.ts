import { describe, expect, it } from "bun:test";

import { manifestVersion } from "./manifestVersion.ts";

describe("manifestVersion", () => {
	it("passes a plain release through, and publishes no version_name", () => {
		expect(manifestVersion("1.0.8")).toEqual({ version: "1.0.8" });
	});

	it("moves a pre-release counter into the fourth component and keeps the semver as version_name", () => {
		expect(manifestVersion("1.1.0-rc.0")).toEqual({
			version: "1.1.0.0",
			"{{chrome}}.version_name": "1.1.0-rc.0",
		});
	});

	it("separates successive candidates, because a browser only updates on a higher version", () => {
		expect(manifestVersion("1.1.0-rc.1").version).toBe("1.1.0.1");
		expect(manifestVersion("1.1.0-rc.2").version).toBe("1.1.0.2");
	});

	it("reads the counter off a pre-release that carries a hyphen of its own", () => {
		expect(manifestVersion("1.1.0-next-3")).toEqual({
			version: "1.1.0.3",
			"{{chrome}}.version_name": "1.1.0-next-3",
		});
	});

	it("refuses a core a browser would reject rather than emitting an unloadable manifest", () => {
		expect(() => manifestVersion("1.1.x")).toThrow(/not one to four dot-separated integers/);
	});

	it("refuses a pre-release with no number, which would collide with the one before it", () => {
		expect(() => manifestVersion("1.1.0-rc")).toThrow(/ends in no number/);
	});

	it("refuses to append a counter to a core that already uses four components", () => {
		expect(() => manifestVersion("1.1.0.4-rc.0")).toThrow(/already uses four components/);
	});
});
