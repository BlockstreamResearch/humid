import { confirmationModel, type ReviewedPlan } from "../confirmation";
import { type Action, programOutputs } from "../document/manifest";
import { type CreatedInstance, resolveCreatedInstance } from "../programs/instance";
import { programHashFrom } from "../programs/programHash";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { inputHookScope, runHook, withHookValues } from "../transaction/hooks";
import { resolveInputRules } from "../transaction/inputRules";
import { withIssuedAmounts } from "../transaction/issuance";
import { planAction } from "../transaction/plan";
import { resolveStaticWitnesses } from "../transaction/witness";
import type { Scope } from "../values/scope";
import { ReviewContext } from "./context";
import { ProgramSpends } from "./programSpends";
import { Reservations } from "./reservations";
import { type Settled, Settlement } from "./settlement";
import type {
	AssetMovement,
	ManifestReview,
	ProgramFinding,
	ReviewedProgramInput,
	ReviewInput,
} from "./types";

const MIN_FEE_SATS = 10n;

export class ActionReview {
	readonly #context: ReviewContext;

	private constructor(context: ReviewContext) {
		this.#context = context;
	}

	static run(
		request: ParsedLiquidProcessCtParams,
		dependencies: ReviewInput,
	): Promise<ManifestReview> {
		const { context, scope } = ReviewContext.prepare(request, dependencies);

		return new ActionReview(context).#run(scope);
	}

	async #run(prepared: Scope): Promise<ManifestReview> {
		const context = this.#context;
		const { action } = context;
		const spent = await new ProgramSpends(context).spend(prepared);
		const reserved = new Reservations(context, spent.inputs).reserve(spent.scope);
		const hooked = runHooks(action, reserved.scope);
		const issuances = reserved.identities.map(({ declared, planned }) =>
			withIssuedAmounts(planned, declared, hooked),
		);
		const created = this.#createInstance(hooked);
		const instanced = created === undefined ? hooked : hooked.withInstance(created.fields);
		const programs = [...spent.findings, ...(await this.#createPrograms(instanced))];
		const programInputs = withWitnessValues(spent.inputs, spent.witnessTypes, action, instanced);
		const scope = instanced.withFee(MIN_FEE_SATS);

		planAction(action, scope, context.declaredTypes);

		const rules = resolveInputRules(action, scope);
		const feeRateSatsPerKvb = await context.feeRate();
		const locktimeHeight = programInputs.length === 0 ? undefined : await context.chainTip();
		const settled = await new Settlement(context, {
			feeRateSatsPerKvb,
			held: spent.held,
			issuances,
			locktimeHeight,
			programInputs,
			programs,
			reserved: reserved.reserved,
			rules,
		}).atStableFee(scope);

		return this.#review(settled, { created, feeRateSatsPerKvb, programInputs, programs });
	}

	#createInstance(scope: Scope): CreatedInstance | undefined {
		const { action, dependencies, manifest, request } = this.#context;

		return action.create_instance === undefined
			? undefined
			: resolveCreatedInstance(action, {
					contractSources: request.contractSources,
					hashProgram: programHashFrom(dependencies.scriptPubKeyOf, manifest.includeDebugSymbols),
					scope,
				});
	}

	async #createPrograms(scope: Scope): Promise<ProgramFinding[]> {
		const created: ProgramFinding[] = [];

		for (const output of programOutputs(this.#context.action)) {
			// oxlint-disable-next-line no-await-in-loop
			const derived = await this.#context.derive(output.reference, scope);

			created.push({ ...derived, role: "created", verified: "not-yet-onchain" });
		}

		return created;
	}

	#review(
		settled: Settled,
		found: {
			created: CreatedInstance | undefined;
			feeRateSatsPerKvb: number;
			programInputs: ReviewedProgramInput[];
			programs: ProgramFinding[];
		},
	): ManifestReview {
		const { action, dependencies, manifest } = this.#context;
		const { draft, ledger, paid, placed, scope } = settled;
		const estimatedFeeSats = (scope.fee ?? 0n) + paid.droppedSats;
		const movements: AssetMovement[] = ledger.entries.map((entry) => ({
			asset: entry.asset,
			sats:
				entry.held -
				entry.needed +
				(paid.returned.get(entry.asset) ?? 0n) -
				(entry.asset === this.#context.policyAsset ? estimatedFeeSats : 0n),
		}));
		const reviewed: ReviewedPlan = {
			...draft,
			...(action.template === undefined ? {} : { boundTo: action.template }),
			...(found.created === undefined ? {} : { createdInstance: found.created }),
			estimatedFeeSats,
			feeRateSatsPerKvb: found.feeRateSatsPerKvb,
			movements,
			policyAsset: this.#context.policyAsset,
			programInputs: found.programInputs,
			programs: found.programs,
			protocol: manifest.protocol ?? "",
			selected: placed.selected,
		};

		return {
			...reviewed,
			confirmation: confirmationModel(reviewed, manifest, action, {
				accountLabel: dependencies.accountLabel,
				policyAsset: this.#context.policyAsset,
				scope,
			}),
		};
	}
}

function runHooks(action: Action, scope: Scope): Scope {
	let running = scope;

	for (const input of action.inputs) {
		if (input.on_resolved !== undefined) {
			running = withHookValues(
				running,
				runHook(input.on_resolved.set, inputHookScope(running, running.inputs[input.label] ?? {})),
			);
		}
	}

	return action.on_pre_broadcast === undefined
		? running
		: withHookValues(running, runHook(action.on_pre_broadcast.set, running));
}

function withWitnessValues(
	inputs: ReviewedProgramInput[],
	witnessTypes: Map<string, Record<string, string>>,
	action: Action,
	scope: Scope,
): ReviewedProgramInput[] {
	const stated = resolveStaticWitnesses(action, scope);

	return inputs.map((program) => {
		const values = stated.get(program.id);
		const types = witnessTypes.get(program.id) ?? {};

		return values === undefined || values.length === 0
			? program
			: {
					...program,
					witnessValues: values.map(({ name, value }) => ({
						name,
						type: types[name] ?? "",
						value,
					})),
				};
	});
}
