"use client";

import { useState } from "react";
import Link from "next/link";
import { TokenPair } from "@/components/TokenIcon";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { TakerSwapPanel } from "@/feature/TakerSwap";
import { useShippedPortfolio } from "@/hooks/useShippedPortfolio";
import { SLEEVE_LABELS, type SleeveId } from "@/lib/portfolio";
import type { ShippedSleeveResult } from "@/lib/ship";
import { shortenAddress } from "@/lib/wallet";
import styles from "./TraderDesk.module.css";

const SWAPABLE_SLEEVES: SleeveId[] = ["low"];

export function TraderDesk() {
	const { result, isReady } = useShippedPortfolio();
	const [selectedSleeve, setSelectedSleeve] = useState<SleeveId>("low");

	if (!isReady) return null;

	if (!result) {
		return (
			<Card className={styles.empty}>
				<CardHeader>
					<CardTitle>No swaps available yet</CardTitle>
					<CardDescription>
						Deploy a portfolio on Home first. Shipped Aqua strategies will show
						up here as SwapVM routes.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button asChild className={styles.cta}>
						<Link href="/">Deploy a portfolio</Link>
					</Button>
				</CardContent>
			</Card>
		);
	}

	const selected =
		result.sleeves.find((sleeve) => sleeve.sleeve === selectedSleeve) ??
		result.sleeves[0];

	return (
		<div className={styles.root}>
			<section aria-labelledby="swap-routes-title">
				<h2 id="swap-routes-title" className={styles.listTitle}>
					Available swaps
				</h2>
				<ul className={styles.list}>
					{result.sleeves.map((sleeve) => (
						<li key={sleeve.sleeve}>
							<SwapRouteButton
								sleeve={sleeve}
								isSelected={sleeve.sleeve === selected.sleeve}
								onSelect={setSelectedSleeve}
							/>
						</li>
					))}
				</ul>
			</section>

			{selected ? (
				<TakerSwapPanel
					strategy={selected.strategy}
					strategyHash={selected.strategyHash}
					pairLabel={SLEEVE_LABELS[selected.sleeve]}
					canSwap={SWAPABLE_SLEEVES.includes(selected.sleeve)}
				/>
			) : null}
		</div>
	);
}

type SwapRouteButtonProps = {
	sleeve: ShippedSleeveResult;
	isSelected: boolean;
	onSelect: (sleeve: SleeveId) => void;
};

function SwapRouteButton({
	sleeve,
	isSelected,
	onSelect,
}: SwapRouteButtonProps) {
	const canSwap = SWAPABLE_SLEEVES.includes(sleeve.sleeve);

	return (
		<button
			type="button"
			className={`${styles.route} ${isSelected ? styles.selected : ""}`}
			onClick={() => onSelect(sleeve.sleeve)}
		>
			<span className={styles.routePair}>
				<TokenPair pair={SLEEVE_LABELS[sleeve.sleeve]} size={20} />
			</span>
			<span className={styles.routeMeta}>
				{canSwap ? "Ready to swap" : "Quote only for now"}
			</span>
			{sleeve.strategyHash ? (
				<code title={sleeve.strategyHash}>
					{shortenAddress(sleeve.strategyHash)}
				</code>
			) : null}
		</button>
	);
}
