"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { AddRobinhoodNetworkButton } from "@/components/ForkWalletActions";
import robinhoodBanner from "@/img/robinhood.png";
import styles from "./LocalForkNotice.module.css";

const SNAPSHOT_URL =
	"https://github.com/CJ42/1inch-aqua-funds-manager/blob/main/robinhood-fork-snapshot.json";
const CHAIN_START_COMMAND =
	"anvil --load-state robinhood-fork-snapshot.json --chain-id 1337 --gas-limit 30000000";

export function LocalForkNotice() {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		await navigator.clipboard.writeText(CHAIN_START_COMMAND);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	}

	return (
		<aside className={styles.notice} aria-labelledby="local-fork-title">
			<Image
				src={robinhoodBanner}
				alt="Robinhood chain"
				className={styles.banner}
				priority
			/>
			<h2 id="local-fork-title" className={styles.title}>
				Step 1 - Run a local Robinhood fork
			</h2>
			<p className={styles.body}>
				To test this app, run a local Anvil node loaded from a frozen
				Robinhood fork snapshot.
			</p>
			<ol className={styles.steps}>
				<li>
					1) Install <code>Foundry</code> to have <code>anvil</code>
				</li>
				<li>
					2) Download{" "}
					<a
						className={styles.link}
						href={SNAPSHOT_URL}
						target="_blank"
						rel="noreferrer"
					>
						robinhood-fork-snapshot.json
					</a>{" "}
					into the folder where you will run Anvil. This file is a
					state dump of the Robinhood fork (Aqua contracts + demo
					balances) so the node can run without the public RPC.
				</li>
				<li>3) Open your terminal and run the following command</li>
			</ol>
			<p className={styles.body}>
				Keep it running on your machine so demo transactions stay local.
			</p>
			<div className={styles.commandRow}>
				<pre className={styles.command}>
					<code>{CHAIN_START_COMMAND}</code>
				</pre>
				<Button
					type="button"
					variant="outline"
					className={styles.copy}
					onClick={handleCopy}
				>
					{copied ? "Copied" : "Copy"}
				</Button>
			</div>
			<div className={styles.networkAction}>
				<AddRobinhoodNetworkButton />
			</div>
		</aside>
	);
}
