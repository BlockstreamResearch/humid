import {
	AnimatePresence,
	motion,
	MotionValue,
	type SpringOptions,
	useMotionValue,
	useSpring,
	useTransform,
} from "motion/react";
import React, { Children, cloneElement, useEffect, useMemo, useRef, useState } from "react";

export type DockItemData = {
	icon: React.ReactNode;
	label: React.ReactNode;
	onClick: () => void;
	className?: string;
};

export type DockProps = {
	items: DockItemData[];
	className?: string;
	distance?: number;
	panelHeight?: number;
	baseItemSize?: number;
	dockHeight?: number;
	magnification?: number;
	spring?: SpringOptions;
};

type DockItemProps = {
	className?: string;
	children: React.ReactNode;
	onClick?: () => void;
	mouseX: MotionValue;
	spring: SpringOptions;
	distance: number;
	baseItemSize: number;
	magnification: number;
};

type DockInjectedProps = {
	isHovered?: MotionValue<number>;
};

function DockItem({
	children,
	className = "",
	onClick,
	mouseX,
	spring,
	distance,
	magnification,
	baseItemSize,
}: DockItemProps) {
	const ref = useRef<HTMLDivElement>(null);
	const isHovered = useMotionValue(0);

	const mouseDistance = useTransform(mouseX, (val) => {
		const rect = ref.current?.getBoundingClientRect() ?? {
			x: 0,
			width: baseItemSize,
		};
		return val - rect.x - baseItemSize / 2;
	});

	const targetSize = useTransform(
		mouseDistance,
		[-distance, 0, distance],
		[baseItemSize, magnification, baseItemSize],
	);
	const size = useSpring(targetSize, spring);

	return (
		<motion.div
			ref={ref}
			style={{
				width: size,
				height: size,
			}}
			onHoverStart={() => isHovered.set(1)}
			onHoverEnd={() => isHovered.set(0)}
			onFocus={() => isHovered.set(1)}
			onBlur={() => isHovered.set(0)}
			onClick={onClick}
			className={`relative inline-flex cursor-pointer items-center justify-center rounded-[10px] border border-solid border-[#222] bg-[#060606] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] ${className}`}
			tabIndex={0}
			role="button"
			aria-haspopup="true"
		>
			{Children.map(children, (child) => {
				if (!React.isValidElement<DockInjectedProps>(child)) {
					return child;
				}

				return cloneElement(child, { isHovered });
			})}
		</motion.div>
	);
}

type DockLabelProps = {
	className?: string;
	children: React.ReactNode;
	isHovered?: MotionValue<number>;
};

function DockLabel({ children, className = "", isHovered }: DockLabelProps) {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (!isHovered) return;

		const unsubscribe = isHovered.on("change", (latest) => {
			setIsVisible(latest === 1);
		});
		return () => unsubscribe();
	}, [isHovered]);

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.div
					initial={{ opacity: 0, y: 0 }}
					animate={{ opacity: 1, y: -10 }}
					exit={{ opacity: 0, y: 0 }}
					transition={{ duration: 0.2 }}
					className={`absolute top-[-1.5rem] left-2/4 w-fit -translate-x-2/4 rounded-md border border-solid border-[#222] bg-[#060606] px-2 py-0.5 text-xs whitespace-pre text-white ${className}`}
					role="tooltip"
					style={{ x: "-50%" }}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

type DockIconProps = {
	className?: string;
	children: React.ReactNode;
};

function DockIcon({ children, className = "" }: DockIconProps) {
	return <div className={`flex items-center justify-center ${className}`}>{children}</div>;
}

export default function UiDock({
	items,
	className = "",
	spring = { mass: 0.1, stiffness: 150, damping: 12 },
	magnification = 70,
	distance = 200,
	panelHeight = 68,
	dockHeight = 256,
	baseItemSize = 50,
}: DockProps) {
	const mouseX = useMotionValue(Infinity);
	const isHovered = useMotionValue(0);

	const maxHeight = useMemo(
		() => Math.max(dockHeight, magnification + magnification / 2 + 4),
		[magnification, dockHeight],
	);
	const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
	const height = useSpring(heightRow, spring);

	return (
		<motion.div
			style={{ height, scrollbarWidth: "none" }}
			className="mx-2 my-0 flex max-w-full items-center"
		>
			<motion.div
				onMouseMove={({ pageX }) => {
					isHovered.set(1);
					mouseX.set(pageX);
				}}
				onMouseLeave={() => {
					isHovered.set(0);
					mouseX.set(Infinity);
				}}
				className={`absolute bottom-2 left-2/4 flex w-fit -translate-x-2/4 items-end gap-4 rounded-2xl border border-solid border-[#222] bg-[#060606] px-2 pt-0 pb-2 ${className}`}
				style={{ height: panelHeight }}
				role="toolbar"
				aria-label="Application dock"
				tabIndex={0}
			>
				{items.map((item, index) => (
					<DockItem
						key={index}
						onClick={item.onClick}
						className={item.className}
						mouseX={mouseX}
						spring={spring}
						distance={distance}
						magnification={magnification}
						baseItemSize={baseItemSize}
					>
						<DockIcon>{item.icon}</DockIcon>
						<DockLabel>{item.label}</DockLabel>
					</DockItem>
				))}
			</motion.div>
		</motion.div>
	);
}
