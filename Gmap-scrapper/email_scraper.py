"""
Email extraction — visits a business's website (and common contact pages)
and pulls out the first public email address.

Google Maps does NOT expose emails on its listings, so the only reliable
source is the business's own website.  We reuse the same headless browser
page the scraper already has open.
"""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

EMAIL_RE = re.compile(
    r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}"
)
IMAGE_EXT = re.compile(r"(png|jpe?g|gif|webp|svg|ico|css|js|woff2?)$", re.I)

# Domains that are directories/social profiles, never the business's own site.
SKIP_HOSTS = {
    "facebook.com", "instagram.com", "youtube.com", "twitter.com", "x.com",
    "linkedin.com", "tiktok.com", "pinterest.com", "yelp.com",
    "maps.google.com", "google.com", "play.google.com", "wa.me",
    "whatsapp.com", "booking.com", "tripadvisor.com", "foursquare.com",
    "linktr.ee", "beacons.ai", "wixsite.com", "mysite.com",
}

# Pages most likely to contain the contact email, tried in order.
CONTACT_PATHS = [
    "",
    "/contact",
    "/contact-us",
    "/contactus",
    "/contact_us",
    "/contacts",
    "/about",
    "/about-us",
    "/aboutus",
    "/pages/contact",
    "/contact.html",
    "/contact-us.html",
    "/en/contact",
    "/kontakt",
]

JUNK_DOMAINS = (
    "example.com", "sentry.io", "schema.org", "wixpress.com", "wordpress.com",
    "cloudflare.com", "googleapis.com", "typekit.com", "hotjar.com",
)


def _valid(email: str) -> bool:
    local, _, domain = email.rpartition("@")
    if not local or not domain:
        return False
    if len(email) > 80 or ".." in local:
        return False
    if IMAGE_EXT.search(local):
        return False
    if any(j in domain for j in JUNK_DOMAINS):
        return False
    return True


def _parse(html: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in EMAIL_RE.findall(html):
        email = raw.strip().strip(".,;:(").lower()
        if email in seen:
            continue
        seen.add(email)
        if _valid(email):
            out.append(email)
    return out


def _should_skip(host: str) -> bool:
    base = host.lower()
    if base.startswith("www."):
        base = base[4:]
    if base in SKIP_HOSTS:
        return True
    return any(base.endswith("." + s) for s in SKIP_HOSTS)


async def find_email_on_site(page, website_url: str, timeout_ms: int = 12_000) -> str:
    """
    Visit a business website + contact pages, return the first email found.

    Returns "" when nothing can be found.  Never raises — callers should not
    let one bad website break the whole scrape.
    """
    url = (website_url or "").strip()
    if not url:
        return ""
    if not url.startswith("http"):
        url = "https://" + url

    try:
        host = urlparse(url).netloc
    except ValueError:
        return ""
    if not host or _should_skip(host):
        return ""

    tried: set[str] = set()
    for path in CONTACT_PATHS:
        target = urljoin(url, path) if path else url
        if target in tried:
            continue
        tried.add(target)
        try:
            await page.goto(target, wait_until="domcontentloaded", timeout=timeout_ms)
            html = await page.content()
        except Exception:
            continue
        emails = _parse(html)
        if emails:
            return emails[0]
    return ""
