"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { RiskProfile } from "@/lib/portfolio";
import { PROFILE_WEIGHTS } from "@/lib/portfolio";
import styles from "./ShipStrategy.module.css";

type ShipConfirmPanelProps = {
	profile: RiskProfile;
	amountUsd: number;
	isShipping: boolean;
	step: string | null;
	error: string | null;
	onShip: () => void;
};

const liquidityPairs = [
	{ sleeve: "low", label: "USDG / WETH" },
	{ sleeve: "medium", label: "WETH / 1INCH" },
	{ sleeve: "high", label: "USDG / TSLA" },
] as const;

export function ShipConfirmPanel({
	profile,
	amountUsd,
	isShipping,
	step,
	error,
	onShip,
}: ShipConfirmPanelProps) {
	const weights = PROFILE_WEIGHTS[profile];
	const isAmountValid = Number.isFinite(amountUsd) && amountUsd >= 10;

	return (
		<Card className={styles.confirmCard}>
			<CardHeader>
				<CardTitle className="text-2xl">Portfolio Overview</CardTitle>
				<CardTitle>Confirm funds allocation</CardTitle>
				<CardDescription>
					Ship a ${isAmountValid ? amountUsd.toLocaleString() : "—"} allocation
					across three Aqua strategies. Confirm each approval and ship in your
					connected wallet.
				</CardDescription>
			</CardHeader>
			<CardContent className={styles.confirmContent}>
				<table className={styles.summaryTable}>
					<thead>
						<tr>
							<th scope="col">Liquidity Pair</th>
							<th scope="col">% Allocated</th>
							<th scope="col">USD Value</th>
						</tr>
					</thead>
					<tbody>
						{liquidityPairs.map((pair) => {
							const percent = Math.round(weights[pair.sleeve] * 100);
							const usdValue = amountUsd * weights[pair.sleeve];

							return (
								<tr key={pair.sleeve}>
									<td>{pair.label}</td>
									<td>{percent}%</td>
									<td>{Number.isFinite(usdValue) ? `$${usdValue.toFixed(0)}` : "—"}</td>
								</tr>
							);
						})}
					</tbody>
				</table>

				{isShipping ? (
					<p className={styles.progress} aria-live="polite">
						{step ?? "Approving tokens and shipping three Aqua strategies…"}
					</p>
				) : null}

				{error ? (
					<p className={styles.error} role="alert">
						{error}
					</p>
				) : null}
			</CardContent>
			<CardFooter>
				<Button
					type="button"
					size="lg"
					className={styles.shipButton}
					disabled={isShipping || !isAmountValid}
					onClick={onShip}
				>
					{isShipping ? "Deploying…" : "Deploy strategies"}
				</Button>
			</CardFooter>
		</Card>
	);
}
