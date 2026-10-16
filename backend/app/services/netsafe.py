"""
Outbound-URL safety (SSRF protection) for user-supplied webhook URLs.

A customer-provided URL must never let them make our server call internal services
(localhost, private networks, cloud metadata at 169.254.169.254, ...). We require https,
a public hostname, no embedded credentials, and we resolve the name and refuse it if ANY
address is not globally routable. Redirects are never followed (see alerts.py), and the
check runs again at send time, not only when the channel is saved.
"""

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit


class UnsafeURL(ValueError):
    """Raised with a user-safe message."""


def parse_public_https_url(url: str):
    """Static checks that need no network. Returns the parsed URL or raises UnsafeURL."""
    url = (url or "").strip()
    if len(url) > 2000:
        raise UnsafeURL("That URL is too long.")
    parts = urlsplit(url)
    if parts.scheme != "https":
        raise UnsafeURL("The URL must start with https://")
    if parts.username or parts.password:
        raise UnsafeURL("The URL must not contain a username or password.")
    host = (parts.hostname or "").lower()
    if not host or "." not in host and not _is_ip(host):
        raise UnsafeURL("Enter a full public hostname.")
    if parts.port not in (None, 443):
        raise UnsafeURL("Only the standard HTTPS port (443) is allowed.")
    if _is_ip(host):
        if not ipaddress.ip_address(host).is_global:
            raise UnsafeURL("That address isn't publicly reachable.")
    elif host == "localhost" or host.endswith((".localhost", ".local", ".internal", ".lan", ".home.arpa")):
        raise UnsafeURL("That hostname isn't publicly reachable.")
    return parts


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def _resolve(host: str):
    return [ai[4][0] for ai in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)]


async def assert_public(url: str):
    """Full check: static rules + DNS. Raises UnsafeURL. Call before saving AND before every send."""
    parts = parse_public_https_url(url)
    host = parts.hostname
    if _is_ip(host):
        return parts
    try:
        addrs = await asyncio.to_thread(_resolve, host)
    except OSError:
        raise UnsafeURL("Couldn't resolve that hostname.") from None
    if not addrs:
        raise UnsafeURL("Couldn't resolve that hostname.")
    for a in addrs:
        ip = ipaddress.ip_address(a.split("%")[0])
        if not ip.is_global:
            raise UnsafeURL("That hostname points to a private or internal address.")
    return parts
