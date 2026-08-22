import base64
import hashlib
import hmac
import os
import time

from .base import HttpConnector

SERVICES = {
    "gamma": "https://gamma-api.polymarket.com",
    "clob": "https://clob.polymarket.com",
    "data": "https://data-api.polymarket.com",
    "bridge": "https://bridge.polymarket.com",
    "relayer": "https://relayer-v2.polymarket.com",
}


class PolymarketClient(HttpConnector):
    """Polymarket REST connector spanning the Gamma, CLOB, Data, Bridge and
    Relayer services.

    All Gamma/Data reads and most CLOB market-data reads are public. Private
    CLOB endpoints use L2 (API-key) auth: HMAC-SHA256 over
    `{timestamp}{METHOD}{path}{body}` with a urlsafe-base64 secret. Order
    placement additionally requires EIP-712 order signing with the wallet's
    private key (use py-clob-client for that; not implemented here).

    Env vars: POLY_ADDRESS, POLY_API_KEY, POLY_API_SECRET, POLY_PASSPHRASE.
    """

    def __init__(self, address: str | None = None, api_key: str | None = None,
                 api_secret: str | None = None, passphrase: str | None = None, **kw):
        super().__init__(**kw)
        self.address = address or os.environ.get("POLY_ADDRESS")
        self.api_key = api_key or os.environ.get("POLY_API_KEY")
        self.api_secret = api_secret or os.environ.get("POLY_API_SECRET")
        self.passphrase = passphrase or os.environ.get("POLY_PASSPHRASE")

    def _l2_headers(self, method: str, path: str, body: str = "") -> dict:
        if not (self.api_key and self.api_secret and self.passphrase and self.address):
            return {}
        ts = str(int(time.time()))
        message = ts + method.upper() + path + body
        secret = base64.urlsafe_b64decode(self.api_secret)
        sig = base64.urlsafe_b64encode(
            hmac.new(secret, message.encode(), hashlib.sha256).digest()
        ).decode()
        return {
            "POLY_ADDRESS": self.address,
            "POLY_SIGNATURE": sig,
            "POLY_TIMESTAMP": ts,
            "POLY_API_KEY": self.api_key,
            "POLY_PASSPHRASE": self.passphrase,
        }

    def call(self, service: str, method: str, path: str, params=None, body=None,
             auth: bool = False):
        if service not in SERVICES:
            raise ValueError(f"unknown service {service!r}; choose from {sorted(SERVICES)}")
        if not path.startswith("/"):
            path = "/" + path
        headers = {}
        if auth and service == "clob":
            import json as _json

            headers = self._l2_headers(method, path, _json.dumps(body) if body else "")
        return self.request(method, SERVICES[service] + path, headers=headers,
                            params=params, body=body)

    # Convenience wrappers for common public reads
    def events(self, **params):
        return self.call("gamma", "GET", "/events", params=params)

    def markets(self, **params):
        return self.call("gamma", "GET", "/markets", params=params)

    def clob_markets(self, next_cursor: str = ""):
        return self.call("clob", "GET", "/markets", params={"next_cursor": next_cursor})

    def book(self, token_id: str):
        return self.call("clob", "GET", "/book", params={"token_id": token_id})

    def midpoint(self, token_id: str):
        return self.call("clob", "GET", "/midpoint", params={"token_id": token_id})

    def price(self, token_id: str, side: str):
        return self.call("clob", "GET", "/price", params={"token_id": token_id, "side": side})

    def trades(self, **params):
        return self.call("data", "GET", "/trades", params=params)

    def positions(self, user: str, **params):
        return self.call("data", "GET", "/positions", params={"user": user, **params})
