import { Copy01Icon, Tick02Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";

import { keyManagerSecretMaterial } from "@/core/key-manager/secret-material";
import { cn } from "@/theme/utils.ts";
import { UiButton } from "@/ui/UiButton/base";
import { UiInput } from "@/ui/UiInput/base";

import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { MnemonicDisplayGrid } from "./MnemonicGrid";

const CREATE_STEPS = ["reveal", "verify"] as const;
type CreateStep = (typeof CREATE_STEPS)[number];

const VERIFY_WORD_COUNT = 3;

export function CreateSeedTab({ onComplete }: { onComplete: (mnemonic: string) => void }) {
	const [mnemonic] = useState(() => keyManagerSecretMaterial.generateMnemonic());
	const words = useMemo(() => keyManagerSecretMaterial.splitMnemonicWords(mnemonic), [mnemonic]);

	const [stepIndex, setStepIndex] = useState(0);
	const step = CREATE_STEPS[stepIndex];
	const prefersReducedMotion = useReducedMotion();

	const goToStep = (next: CreateStep) => setStepIndex(CREATE_STEPS.indexOf(next));

	const stepContent: Record<CreateStep, ReactNode> = {
		reveal: <RevealStep words={words} mnemonic={mnemonic} onNext={() => goToStep("verify")} />,
		verify: (
			<VerifyStep
				words={words}
				onBack={() => goToStep("reveal")}
				onComplete={() => onComplete(mnemonic)}
			/>
		),
	};

	const motionProps = prefersReducedMotion
		? { animate: { opacity: 1 }, exit: { opacity: 0 }, initial: { opacity: 0 } }
		: {
				animate: { opacity: 1, x: 0 },
				exit: { opacity: 0, x: -16 },
				initial: { opacity: 0, x: 16 },
				transition: { duration: 0.18, ease: "easeOut" as const },
			};

	return (
		<motion.div
			layout
			transition={{ layout: { duration: 0.22, ease: "easeOut" } }}
			className="flex flex-col gap-4"
		>
			<div className="flex items-center justify-center gap-1.5">
				{CREATE_STEPS.map((stepName, index) => (
					<span
						key={stepName}
						className={cn(
							"h-1.5 rounded-full transition-all",
							index === stepIndex ? "bg-primary w-5" : "bg-muted w-1.5",
						)}
					/>
				))}
			</div>

			<AnimatePresence initial={false} mode="wait">
				<motion.div key={step} className="flex flex-col gap-4" {...motionProps}>
					{stepContent[step]}
				</motion.div>
			</AnimatePresence>
		</motion.div>
	);
}

function RevealStep({
	words,
	mnemonic,
	onNext,
}: {
	words: string[];
	mnemonic: string;
	onNext: () => void;
}) {
	const [hidden, setHidden] = useState(false);
	const { copied, copy } = useCopyToClipboard();

	return (
		<>
			<p className="text-muted-foreground text-center text-sm leading-6">
				Keep this recovery phrase safe, offline if possible. Anyone with it controls your funds.
			</p>

			<MnemonicDisplayGrid words={words} hidden={hidden} />

			<div className="flex items-center justify-center gap-3">
				<UiButton
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setHidden((value) => !value)}
				>
					<HugeiconsIcon icon={hidden ? ViewIcon : ViewOffIcon} />
					{hidden ? "Show" : "Hide"}
				</UiButton>
				<UiButton type="button" variant="ghost" size="sm" onClick={() => void copy(mnemonic)}>
					<HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} />
					{copied ? "Copied" : "Copy"}
				</UiButton>
			</div>

			<UiButton type="button" size="lg" onClick={onNext}>
				I saved it
			</UiButton>
		</>
	);
}

function VerifyStep({
	words,
	onBack,
	onComplete,
}: {
	words: string[];
	onBack: () => void;
	onComplete: () => void;
}) {
	const positions = useMemo(() => pickRandomPositions(VERIFY_WORD_COUNT, words.length), [words]);
	const [answers, setAnswers] = useState<Record<number, string>>({});

	const isMatched = (position: number) =>
		answers[position]?.trim().toLowerCase() === words[position];
	const allMatched = positions.every(isMatched);

	return (
		<>
			<p className="text-muted-foreground text-center text-sm leading-6">
				Confirm you saved it: enter the requested words.
			</p>

			<div className="flex flex-col gap-2">
				{positions.map((position) => {
					const filled = (answers[position] ?? "").length > 0;
					const matched = isMatched(position);

					return (
						<label
							key={position}
							className="bg-muted flex items-center gap-2 rounded-lg px-3 py-1.5"
						>
							<span className="text-muted-foreground w-14 shrink-0 font-mono text-sm tabular-nums">
								Word {position + 1}
							</span>
							<UiInput
								value={answers[position] ?? ""}
								autoCapitalize="off"
								autoComplete="off"
								autoCorrect="off"
								className="h-7 border-0 bg-transparent px-0 font-mono focus-visible:ring-0"
								spellCheck={false}
								onChange={(event) =>
									setAnswers((current) => ({ ...current, [position]: event.target.value }))
								}
							/>
							{filled && (
								<HugeiconsIcon
									icon={Tick02Icon}
									className={cn("size-4 shrink-0", matched ? "text-primary" : "opacity-0")}
								/>
							)}
						</label>
					);
				})}
			</div>

			<div className="flex flex-col gap-2">
				<UiButton type="button" size="lg" disabled={!allMatched} onClick={onComplete}>
					Continue
				</UiButton>
				<UiButton type="button" variant="ghost" onClick={onBack}>
					Back
				</UiButton>
			</div>
		</>
	);
}

function pickRandomPositions(count: number, max: number): number[] {
	const pool = Array.from({ length: max }, (_, index) => index);

	for (let index = 0; index < count; index += 1) {
		const swapWith = index + randomInt(max - index);
		[pool[index], pool[swapWith]] = [pool[swapWith], pool[index]];
	}

	return pool.slice(0, count).toSorted((left, right) => left - right);
}

function randomInt(maxExclusive: number): number {
	const buffer = new Uint32Array(1);
	crypto.getRandomValues(buffer);

	return buffer[0] % maxExclusive;
}
