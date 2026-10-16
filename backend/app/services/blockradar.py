import re
import httpx
from dataclasses import dataclass
from typing import Optional
from app.core.config import get_settings

settings = get_settings()

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class CredentialError(Exception):
    """Raised with a user-safe message when Blockradar credentials are invalid or unusable."""


@dataclass(frozen=True)
class Creds:
    api_key: str
    wallet_id: str

    @staticmethod
    def validate_format(api_key: str, wallet_id: str) -> "Creds":
        api_key = (api_key or "").strip()
        wallet_id = (wallet_id or "").strip()
        # wallet_id is interpolated into request URLs, so it must be a strict UUID (no path tricks)
        if not _UUID_RE.match(wallet_id):
            raise CredentialError("Wallet ID must be a UUID like 123e4567-e89b-12d3-a456-426614174000.")
        if not (16 <= len(api_key) <= 400) or any(c.isspace() for c in api_key):
            raise CredentialError("That doesn't look like a valid Blockradar API key.")
        return Creds(api_key=api_key, wallet_id=wallet_id)


class BlockradarClient:
    """
    HTTP client for the Blockradar REST API.
    Docs: https://docs.blockradar.co/en/api-reference/introduction
    """

    def __init__(self, creds: Optional[Creds] = None):
        # base_url is fixed server-side (never user-supplied) to prevent SSRF
        self.base_url = settings.blockradar_base_url
        self.api_key = creds.api_key if creds else settings.blockradar_api_key
        self.wallet_id = creds.wallet_id if creds else settings.blockradar_wallet_id
        self.headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    # ─────────────────────────────────────────
    # WALLET
    # ─────────────────────────────────────────

    async def get_wallet(self) -> dict:
        """GET /wallets/{walletId} — master wallet info."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/wallets/{self.wallet_id}",
                headers=self.headers,
                timeout=30,
            )
            response.raise_for_status()
            return response.json().get("data", {})

    async def get_wallet_balances(self) -> dict:
        """GET /wallets/{walletId}/balances — balances per asset."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/wallets/{self.wallet_id}/balances",
                headers=self.headers,
                timeout=30,
            )
            response.raise_for_status()
            return response.json().get("data", {})

    # ─────────────────────────────────────────
    # ADDRESSES (child wallets = fintech customers)
    # ─────────────────────────────────────────

    async def get_addresses(
        self,
        page: int = 1,
        limit: int = 100,
    ) -> dict:
        """GET /wallets/{walletId}/addresses — paginated list of all addresses."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/wallets/{self.wallet_id}/addresses",
                headers=self.headers,
                params={"page": page, "limit": limit},
                timeout=30,
            )
            response.raise_for_status()
            return response.json()

    async def get_all_addresses(self) -> list:
        """Fetch every address across all pages — handles edge cases."""
        all_addresses = []
        page = 1

        while True:
            response = await self.get_addresses(page=page, limit=100)

            # handle different response shapes
            data = response.get("data", [])
            if isinstance(data, dict):
                # some endpoints wrap in {data: {data: [], meta: {}}}
                data = data.get("data", [])

            meta = response.get("meta", {})
            if not meta:
                meta = response.get("pagination", {})

            all_addresses.extend(data)

            current_page = meta.get("currentPage", meta.get("page", 1))
            total_pages  = meta.get("totalPages", meta.get("pages", 1))
            total_items  = meta.get("total", meta.get("totalItems", len(data)))

            print(f"  Addresses page {current_page}/{max(total_pages,1)} "
                f"({len(all_addresses)} fetched, {total_items} total)")

            # stop if no more pages or no data returned
            if not data or current_page >= max(total_pages, 1):
                break

            page += 1

        return all_addresses

    async def get_address(self, address_id: str) -> dict:
        """GET /wallets/{walletId}/addresses/{addressId}"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/wallets/{self.wallet_id}/addresses/{address_id}",
                headers=self.headers,
                timeout=30,
            )
            response.raise_for_status()
            return response.json().get("data", {})

    async def get_address_balance(self, address_id: str, asset_id: str) -> dict:
        """GET /wallets/{walletId}/addresses/{addressId}/balance?assetId=... (assetId is required)"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/wallets/{self.wallet_id}/addresses/{address_id}/balance",
                headers=self.headers,
                params={"assetId": asset_id},
                timeout=30,
            )
            response.raise_for_status()
            return response.json().get("data", {})

    # ─────────────────────────────────────────
    # TRANSACTIONS
    # ─────────────────────────────────────────

    async def get_transactions(
        self,
        page: int = 1,
        limit: int = 100,
        status: Optional[str] = None,
    ) -> dict:
        """GET /wallets/{walletId}/transactions — paginated transactions."""
        params = {"page": page, "limit": limit}
        if status:
            params["status"] = status

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/wallets/{self.wallet_id}/transactions",
                headers=self.headers,
                params=params,
                timeout=30,
            )
            response.raise_for_status()
            return response.json()

    async def get_all_transactions(self, max_pages: int = 50) -> list:
        """Fetch transactions across all pages."""
        all_transactions = []
        page = 1

        while page <= max_pages:
            response = await self.get_transactions(page=page, limit=100)

            data = response.get("data", [])
            if isinstance(data, dict):
                data = data.get("data", [])

            meta = response.get("meta", {})
            if not meta:
                meta = response.get("pagination", {})

            all_transactions.extend(data)

            current_page = meta.get("currentPage", meta.get("page", 1))
            total_pages  = meta.get("totalPages", meta.get("pages", 1))
            total_items  = meta.get("total", meta.get("totalItems", len(data)))

            print(f"  Transactions page {current_page}/{max(total_pages,1)} "
                f"({len(all_transactions)} fetched, {total_items} total)")

            if not data or current_page >= max(total_pages, 1):
                break

            page += 1

        return all_transactions

    async def get_address_transactions(
        self,
        address_id: str,
        page: int = 1,
        limit: int = 100,
    ) -> dict:
        """GET /wallets/{walletId}/addresses/{addressId}/transactions"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/wallets/{self.wallet_id}/addresses/{address_id}/transactions",
                headers=self.headers,
                params={"page": page, "limit": limit},
                timeout=30,
            )
            response.raise_for_status()
            return response.json()

    # ─────────────────────────────────────────
    # MISCELLANEOUS
    # ─────────────────────────────────────────

    async def get_supported_assets(self) -> list:
        """GET /assets — all supported assets."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/assets",
                headers=self.headers,
                timeout=30,
            )
            response.raise_for_status()
            return response.json().get("data", [])

    async def get_supported_blockchains(self) -> list:
        """GET /blockchains — all supported chains."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/blockchains",
                headers=self.headers,
                timeout=30,
            )
            response.raise_for_status()
            return response.json().get("data", [])

    async def ping(self) -> bool:
        """Quick health check — returns True if API key is valid."""
        try:
            await self.get_wallet()
            return True
        except Exception:
            return False


async def verify_credentials(creds: Creds) -> None:
    """Confirm the key can read the wallet. Raises CredentialError with a user-safe message."""
    client = BlockradarClient(creds)
    try:
        await client.get_wallet()
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        if code in (401, 403):
            raise CredentialError("Blockradar rejected this API key for that wallet.") from None
        if code == 404:
            raise CredentialError("Blockradar couldn't find that wallet ID.") from None
        raise CredentialError(f"Blockradar returned an error ({code}). Please try again.") from None
    except httpx.HTTPError:
        raise CredentialError("Couldn't reach Blockradar. Please try again in a moment.") from None
