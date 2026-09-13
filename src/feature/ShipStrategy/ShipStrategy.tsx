"use client";

import { useState } from "react";
import type { Address } from "viem";
import { StrategyCards } from "@/components/StrategyCard";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/hooks/useWallet";
import type { RiskProfile } from "@/lib/portfolio";
import { FIXED_SHIP_TOTAL_USD, type ShipPortfolioResult } from "@/lib/ship";
import { saveShippedPortfolio } from "@/lib/ship-store";
import { formatWalletError, getEthereumProvider } from "@/lib/wallet";
import { shipPortfolio } from "./api";
import { ShipConfirmPanel } from "./ShipConfirmPanel";
import { ShipResultDialog } from "./ShipResultDialog";
import styles from "./ShipStrategy.module.css";

export function ShipStrategy() {
	const { address, connect, isConnecting } = useWallet();
	const [selectedProfile, setSelectedProfile] = useState<RiskProfile | null>(
		null,
	);
	const [investAmountUsd, setInvestAmountUsd] = useState(FIXED_SHIP_TOTAL_USD);
	const [error, setError] = useState<string | null>(null);
	const [step, setStep] = useState<string | null>(null);
	const [result, setResult] = useState<ShipPortfolioResult | null>(null);
	const [isResultOpen, setIsResultOpen] = useState(false);
	const [isShipping, setIsShipping] = useState(false);

	const isAmountValid =
		Number.isFinite(investAmountUsd) && investAmountUsd >= 10;

	async function handleShip() {
		if (!selectedProfile || !isAmountValid || isShipping || isConnecting)
			return;

		setError(null);
		setIsShipping(true);

		try {
			if (!address) {
				setStep("Connect your wallet…");
				await connect();
			}

			const accounts = (await getEthereumProvider().request({
				method: "eth_requestAccounts",
			})) as string[];
			const account = accounts[0] as Address | undefined;
			if (!account) throw new Error("Connect a wallet first");

			const shipped = await shipPortfolio(
				selectedProfile,
				account,
				investAmountUsd,
				setStep,
			);
			saveShippedPortfolio(shipped);
			setResult(shipped);
			setIsResultOpen(true);
		} catch (shipError) {
			setError(formatWalletError(shipError, "Failed to ship portfolio"));
		} finally {
			setIsShipping(false);
			setStep(null);
		}
	}

	return (
		<div className={styles.root}>
			<div className={styles.amountSection}>
				<label className={styles.amountLabel} htmlFor="invest-amount-usd">
					Investment amount (USD)
				</label>
				<Input
					id="invest-amount-usd"
					type="number"
					min={10}
					step={10}
					value={Number.isFinite(investAmountUsd) ? investAmountUsd : ""}
					disabled={isShipping}
					onChange={(event) =>
						setInvestAmountUsd(event.target.valueAsNumber)
					}
				/>
			</div>

			<StrategyCards
				selectedProfile={selectedProfile}
				onSelect={setSelectedProfile}
				disabled={isShipping}
			/>

			{selectedProfile ? (
				<div className={styles.confirmSection}>
					<ShipConfirmPanel
						profile={selectedProfile}
						amountUsd={investAmountUsd}
						isShipping={isShipping}
						step={step}
						error={error}
						onShip={handleShip}
					/>
				</div>
			) : null}

			<ShipResultDialog
				open={isResultOpen}
				result={result}
				onOpenChange={setIsResultOpen}
			/>
		</div>
	);
}
