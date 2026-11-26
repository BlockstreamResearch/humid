import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";

import type { LiquidContractTools } from "../../application/methods/processConfidentialTransaction";
import { assembleReviewedTransaction } from "./assembleReviewedTransaction";
import {
	createSmplxProgramAbi,
	createSmplxProgramCompiler,
	createSmplxScriptHasher,
} from "./compileProgramWithSmplx";
import { loadSmplxWasm } from "./loadSmplxWasm";

// Any valid key sizes a confidential output; fee estimates never sign.
const SIZING_BLINDING_KEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

export function smplxContractTools(load = loadSmplxWasm) {
	return async (network: string): Promise<LiquidContractTools> => {
		const smplx = await load();

		return {
			compiler: {
				abi: createSmplxProgramAbi(smplx),
				compile: createSmplxProgramCompiler(smplx),
				scriptHashOf: createSmplxScriptHasher(smplx, network),
				version: SMPLX_COMPILER_VERSION,
			},

			estimateFee: (draft, feeRateSatsPerKvb, signingDerivationPath) =>
				assembleReviewedTransaction(
					draft,
					{ blindingPublicKeyHex: SIZING_BLINDING_KEY, signingDerivationPath, smplx },
					(builder) => smplx.Signer.estimateStrictFee(builder, network, feeRateSatsPerKvb),
				),

			sign(mnemonic, review, signingDerivationPath) {
				const signer = new smplx.Signer(mnemonic, network);

				try {
					return assembleReviewedTransaction(
						review,
						{ blindingPublicKeyHex: signer.blindingPublicKey(), signingDerivationPath, smplx },
						(builder) => {
							const result = signer.finalizeStrictFee(builder, review.feeRateSatsPerKvb);

							try {
								return { feeSats: result.feeSats, hex: result.hex, txid: result.txid };
							} finally {
								result.free();
							}
						},
					);
				} finally {
					signer.free();
				}
			},
		};
	};
}
