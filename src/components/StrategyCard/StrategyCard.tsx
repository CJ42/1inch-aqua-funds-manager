"use client";

import {
	ArcElement,
	type ChartData,
	Chart as ChartJS,
	type ChartOptions,
	Tooltip,
} from "chart.js";
import { Check } from "lucide-react";
import { Pie } from "react-chartjs-2";
import { TokenPair } from "@/components/TokenIcon";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { PROFILE_WEIGHTS, type RiskProfile } from "@/lib/portfolio";
import styles from "./StrategyCard.module.css";

export type Strategy = {
	id: RiskProfile;
	name: string;
	description: string;
	cardColor: string;
	chartColors: [string, string, string];
};

type StrategyCardProps = {
	strategy: Strategy;
	isSelected: boolean;
	onSelect: (profile: RiskProfile) => void;
	disabled?: boolean;
};

type StrategyCardsProps = {
	selectedProfile: RiskProfile | null;
	onSelect: (profile: RiskProfile) => void;
	disabled?: boolean;
};

ChartJS.register(ArcElement, Tooltip);

export function StrategyCards({
	selectedProfile,
	onSelect,
	disabled = false,
}: StrategyCardsProps) {
	return (
		<div>
			<div className={styles.grid}>
				{strategies.map((strategy) => (
					<StrategyCard
						key={strategy.id}
						strategy={strategy}
						isSelected={selectedProfile === strategy.id}
						onSelect={onSelect}
						disabled={disabled}
					/>
				))}
			</div>
			<p className={styles.selectionStatus} aria-live="polite">
				{selectedProfile
					? `${strategyById[selectedProfile].name} strategy selected`
					: "Select a strategy to continue"}
			</p>
		</div>
	);
}

export function StrategyCard({
	strategy,
	isSelected,
	onSelect,
	disabled = false,
}: StrategyCardProps) {
	const weights = PROFILE_WEIGHTS[strategy.id];
	const allocations = [
		Math.round(weights.low * 100),
		Math.round(weights.medium * 100),
		Math.round(weights.high * 100),
	];
	const chartData: ChartData<"pie"> = {
		labels: liquidityPairs,
		datasets: [
			{
				data: allocations,
				backgroundColor: strategy.chartColors,
				borderColor: strategy.cardColor,
				borderWidth: 3,
				hoverOffset: 3,
			},
		],
	};

	return (
		<Card
			className={`${styles.card} ${styles[strategy.id]} ${
				isSelected ? styles.selected : ""
			}`}
		>
			<CardHeader className={styles.cardHeader}>
				<div className={styles.headingRow}>
					<div>
						<CardTitle className={styles.cardTitle}>{strategy.name}</CardTitle>
						<CardDescription className={styles.cardDescription}>
							{strategy.description}
						</CardDescription>
					</div>
					{isSelected ? (
						<span className={styles.selectedMark} aria-hidden="true">
							<Check />
						</span>
					) : null}
				</div>
				<div className={styles.chart}>
					<Pie
						data={chartData}
						options={chartOptions}
						role="img"
						aria-label={`${strategy.name} allocation: ${allocations.join(
							"%, ",
						)}%`}
					/>
				</div>
			</CardHeader>
			<CardContent className={styles.cardContent}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th scope="col">Liquidity Pair</th>
							<th scope="col">% Allocated</th>
						</tr>
					</thead>
					<tbody>
						{liquidityPairs.map((pair, index) => (
							<tr key={pair}>
								<td>
									<TokenPair pair={pair} size={18} />
								</td>
								<td>{allocations[index]}%</td>
							</tr>
						))}
					</tbody>
				</table>
			</CardContent>
			<CardFooter className={styles.cardFooter}>
				<Button
					type="button"
					size="lg"
					className={styles.selectButton}
					aria-pressed={isSelected}
					disabled={disabled}
					onClick={() => onSelect(strategy.id)}
				>
					{isSelected ? "Selected" : "Select"}
				</Button>
			</CardFooter>
		</Card>
	);
}

const chartOptions: ChartOptions<"pie"> = {
	responsive: true,
	maintainAspectRatio: false,
	animation: {
		duration: 500,
	},
	plugins: {
		legend: {
			display: false,
		},
		tooltip: {
			callbacks: {
				label(context) {
					return ` ${context.label}: ${context.parsed}%`;
				},
			},
		},
	},
};

export const liquidityPairs = ["USDG / WETH", "WETH / 1INCH", "USDG / TSLA"];

export const strategies: Strategy[] = [
	{
		id: "conservative",
		name: "Conservative",
		description: "Prioritises stability with more low-risk liquidity.",
		cardColor: "#C2E8EF",
		chartColors: ["#276C78", "#73BCC8", "#EAF8FA"],
	},
	{
		id: "balanced",
		name: "Balanced",
		description: "Balances stability with broader growth exposure.",
		cardColor: "#F9F1E1",
		chartColors: ["#9A661D", "#D8AB62", "#FFF9ED"],
	},
	{
		id: "aggressive",
		name: "Aggressive",
		description: "Prioritises higher-risk assets and growth potential.",
		cardColor: "#E5E2F8",
		chartColors: ["#62579E", "#9D94D2", "#F5F3FF"],
	},
];

export const strategyById = Object.fromEntries(
	strategies.map((strategy) => [strategy.id, strategy]),
) as Record<RiskProfile, Strategy>;
