"""
Simulator Service
=================
Generates realistic Blockradar-shaped data for development/demo mode.
Produces data in the exact same format as the real Blockradar API,
so the pipeline and dashboard work identically in both modes.
"""

import uuid
import random
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict

np.random.seed(42)
random.seed(42)

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
START_DATE = datetime(2024, 1, 1)
END_DATE = datetime(2026, 3, 1)

REGIONS = {
    "Africa":         {"weight": 0.45, "countries": ["Nigeria","Ghana","Kenya","South Africa","Egypt"]},
    "LatAm":          {"weight": 0.25, "countries": ["Brazil","Mexico","Argentina","Colombia","Chile"]},
    "Middle East":    {"weight": 0.18, "countries": ["UAE","Saudi Arabia","Jordan","Kuwait","Bahrain"]},
    "Southeast Asia": {"weight": 0.12, "countries": ["Indonesia","Philippines","Vietnam","Thailand","Malaysia"]},
}

FINTECH_TYPES = ["Neobank","Remittance","B2B Payments","Crypto Exchange","Savings App","BNPL","Payroll"]

CURRENCIES = ["USDC", "USDT", "PYUSD"]
NETWORKS = ["ethereum", "tron", "polygon", "base", "bnb"]
TX_TYPES = ["deposit", "withdrawal", "transfer", "swap"]
TX_STATUSES = ["SUCCESS", "FAILED", "PENDING"]

FINTECH_NAMES = [
    "FlowPay","ZaraMonie","ChainBridge","NovaCash","RemitEase","StableSend","ClearVault",
    "PocketFi","SwiftRail","TrustLayer","AnchorPay","QuickRemit","LoopFinance","BridgeFi",
    "LiquidPay","UrbanWallet","CrossBorder","ZestMoney","PayNow","VaultX","MintChain",
    "NovaRemit","SolarPay","EagleFi","LinkBridge","ClearSend","RapidVault","BluePay",
    "SwiftChain","TerraFi","PeakRemit","OmniPay","CryptoFlow","GridWallet","ZeroFi",
]


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _random_date(start: datetime, end: datetime) -> datetime:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def _random_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:16]}"


def _pick_region() -> tuple:
    regions = list(REGIONS.keys())
    weights = [REGIONS[r]["weight"] for r in regions]
    region = random.choices(regions, weights=weights, k=1)[0]
    country = random.choice(REGIONS[region]["countries"])
    return region, country


# ─────────────────────────────────────────────
# GENERATORS
# ─────────────────────────────────────────────

def generate_addresses(n: int = 100_000) -> List[Dict]:
    """
    Generate simulated address objects matching Blockradar API shape:
    GET /wallets/{id}/addresses
    """
    print(f"Simulating {n:,} addresses...")
    addresses = []

    # assign addresses to fintechs via pareto distribution
    n_fintechs = len(FINTECH_NAMES)
    weights = np.random.pareto(1.5, n_fintechs) + 1
    weights /= weights.sum()
    counts = (weights * n).astype(int)
    counts[-1] += n - counts.sum()

    for fi, fintech_name in enumerate(FINTECH_NAMES):
        region, country = _pick_region()
        fintech_id = _random_id("ft_")

        # Health profile: real portfolios aren't uniformly healthy. Healthy fintechs keep onboarding
        # wallets right up to the end; fading ones stopped ~6-10 weeks ago; quiet ones months ago.
        profile = random.choices(["healthy", "fading", "quiet"], weights=[0.60, 0.22, 0.18])[0]
        idle_days = 0 if profile == "healthy" else random.randint(40, 75) if profile == "fading" else random.randint(130, 260)
        latest_created = END_DATE - timedelta(days=30 + idle_days)

        for _ in range(counts[fi]):
            created = _random_date(START_DATE, latest_created)
            days_span = (END_DATE - created).days

            # dormancy logic
            if random.random() < 0.22:
                # never became active
                last_active = created
            else:
                offset = int(np.random.exponential(30))
                last_active = created + timedelta(days=min(offset, days_span))

            days_since = (END_DATE - last_active).days
            is_dormant = days_since > 60

            addresses.append({
                "id": _random_id("addr_"),
                "address": f"0x{uuid.uuid4().hex[:40]}",
                "network": random.choice(NETWORKS),
                "currency": random.choices(CURRENCIES, weights=[0.55, 0.35, 0.10])[0],
                "label": f"{fintech_name}_customer_{random.randint(1000,9999)}",
                "balance": round(random.uniform(0, 5000), 4),
                "balanceUsd": round(random.uniform(0, 5000), 2),
                "totalReceived": round(random.uniform(0, 50000), 4),
                "totalSent": round(random.uniform(0, 50000), 4),
                "totalTransactions": random.randint(0, 80),
                "lastActive": last_active.isoformat(),
                "createdAt": created.isoformat(),
                "isDormant": is_dormant,
                "daysSinceLastTx": days_since,
                # extra fields for our pipeline
                "_fintechId": fintech_id,
                "_fintechName": fintech_name,
                "_fintechType": random.choice(FINTECH_TYPES),
                "_region": region,
                "_country": country,
            })

    print(f"  -> {len(addresses):,} addresses generated")
    return addresses


def generate_transactions(addresses: List[Dict], max_per_address: int = 60) -> List[Dict]:
    """
    Generate simulated transaction objects matching Blockradar API shape:
    GET /wallets/{id}/transactions
    """
    print("Simulating transactions...")
    transactions = []

    # A dormant wallet is one that WAS active and went quiet, so it has history too. Only the wallets that
    # never activated (lastActive == createdAt) have none. Sample per fintech so every fintech has a timeline.
    by_fintech = {}
    for a in addresses:
        if a["lastActive"] != a["createdAt"]:
            by_fintech.setdefault(a["_fintechId"], []).append(a)
    sample = []
    for group in by_fintech.values():
        sample.extend(random.sample(group, min(len(group), 250)))

    for addr in sample:
        n_tx = min(int(np.random.exponential(8)) + 1, max_per_address)
        created = datetime.fromisoformat(addr["createdAt"])
        last_active = datetime.fromisoformat(addr["lastActive"])
        span = max((last_active - created).days, 1)

        for _ in range(n_tx):
            tx_date = created + timedelta(days=random.randint(0, span))
            amount = round(float(np.random.lognormal(4.5, 1.8)), 2)
            amount = min(amount, 50_000)
            status = random.choices(TX_STATUSES, weights=[0.93, 0.05, 0.02])[0]

            transactions.append({
                "id": _random_id("tx_"),
                "hash": f"0x{uuid.uuid4().hex}",
                "type": random.choices(TX_TYPES, weights=[0.35, 0.30, 0.25, 0.10])[0],
                "status": status,
                "network": addr["network"],
                "currency": addr["currency"],
                "amount": amount,
                "amountUsd": amount,
                "fee": round(random.uniform(0.001, 2.0), 4),
                "feeUsd": round(random.uniform(0.01, 5.0), 2),
                "fromAddress": f"0x{uuid.uuid4().hex[:40]}",
                "toAddress": addr["address"],
                "createdAt": tx_date.isoformat(),
                # extra fields for our pipeline
                "_walletId": addr["id"],
                "_fintechId": addr["_fintechId"],
                "_fintechName": addr["_fintechName"],
                "_region": addr["_region"],
            })

    print(f"  -> {len(transactions):,} transactions generated")
    return transactions


def run_simulation() -> Dict:
    """
    Entry point — returns addresses and transactions as a dict.
    Used by the pipeline ingest step in simulated mode.
    """
    print("=" * 50)
    print("  BLOCKRADAR SIMULATOR")
    print("=" * 50)

    addresses = generate_addresses(n=100_000)
    transactions = generate_transactions(addresses)

    dormant_count = sum(1 for a in addresses if a["isDormant"])
    success_tx = [t for t in transactions if t["status"] == "SUCCESS"]
    total_volume = sum(t["amountUsd"] for t in success_tx)

    print(f"\n  Summary:")
    print(f"  Addresses  : {len(addresses):,}")
    print(f"  Dormant    : {dormant_count:,} ({dormant_count/len(addresses):.1%})")
    print(f"  Transactions: {len(transactions):,}")
    print(f"  Volume (USD): ${total_volume:,.0f}")
    print("=" * 50)

    return {
        "addresses": addresses,
        "transactions": transactions,
    }