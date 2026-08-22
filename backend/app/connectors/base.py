import json

import requests


class HttpConnector:
    """Thin HTTP layer shared by the platform connectors."""

    def __init__(self, timeout: float = 30.0):
        self.session = requests.Session()
        self.timeout = timeout

    def request(self, method, url, headers=None, params=None, body=None):
        resp = self.session.request(
            method=method.upper(),
            url=url,
            headers=headers,
            params=params,
            json=body,
            timeout=self.timeout,
        )
        try:
            data = resp.json()
        except ValueError:
            data = resp.text
        return {"status": resp.status_code, "ok": resp.ok, "data": data}


def pretty(result) -> str:
    return json.dumps(result, indent=2, default=str)
