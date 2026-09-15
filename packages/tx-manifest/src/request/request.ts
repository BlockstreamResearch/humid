/**
 * The request a site sends to perform one action of a txManifest protocol.
 *
 * Six parts, per the accepted request contract: the manifest, the sources of the
 * contracts it references, the chosen action and its filled parameters, and the two
 * mutable protocol files the site holds — the instance file (this deployment's field
 * values) and the state file (its live covenant UTXO set).
 *
 * The last two are optional at the wire level because not every manifest needs them —
 * a protocol with no covenant parameters has no instance file, and an action that
 * creates rather than spends has nothing to read from state. Whether a *specific*
 * action can proceed without them is a different question, answered by inspecting what
 * that action actually references rather than by the shape of the request.
 *
 * The fee is deliberately absent. The wallet establishes the fee and the fee rate; a
 * fee-like value arriving here would be ignored rather than honoured.
 */
export type ParsedLiquidProcessCtParams = {
	/** The chosen action's name, as it appears in the manifest. */
	action: string;
	/** Whether to broadcast the finished transaction or return it unsent. */
	broadcast: boolean;
	/**
	 * Source text of every contract the manifest references, keyed by the path the
	 * manifest uses. Sources are not published with a manifest; they arrive here.
	 */
	contractSources: Record<string, string>;
	/** This deployment's field values, when the protocol has any. */
	instance?: Record<string, unknown>;
	/** The txManifest document itself. */
	manifest: Record<string, unknown>;
	/** The filled parameters of the chosen action. */
	params: Record<string, unknown>;
	/** The deployment's live covenant UTXO set, when the action reads one. */
	state?: Record<string, unknown>;
};

/** One request part, named the way a refusal message names it. */
export type RequestPart = "contractSources" | "instance" | "params" | "state";

/**
 * What a specific action needs from the request, and what of that is absent.
 *
 * `missing` is what makes a refusal answerable: it names the part and, where the part
 * is a map, the exact keys that were referenced and not supplied.
 */
export type ActionRequirements = {
	missing: MissingPart[];
	required: RequestPart[];
};

export type MissingPart = {
	/** Which keys were referenced and not supplied, when the part is a map. */
	keys?: string[];
	part: RequestPart;
	/** Why the action needs it, in the manifest's own terms. */
	reason: string;
};
