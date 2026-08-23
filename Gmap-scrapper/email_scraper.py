"""
High-Speed Email Extraction Engine — visits business websites asynchronously via HTTP (httpx)
and falls back to Playwright browser if needed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx

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
    "/about",
    "/about-us",
]

JUNK_DOMAINS = (
    "example.com", "sentry.io", "schema.org", "wixpress.com", "wordpress.com",
    "cloudflare.com", "googleapis.com", "typekit.com", "hotjar.com", "sentry-cdn.com",
    "domain.com", "email.com",
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


@dataclass
class SiteScrapeResult:
    website: str = ""
    email: str = ""
    company_name: str = ""


def normalize_domain(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    if not raw.startswith("http"):
        raw = "https://" + raw
    try:
        host = urlparse(raw).netloc.lower()
    except ValueError:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def domain_to_company(host: str) -> str:
    if not host:
        return ""
    base = host.split(".")[0]
    base = re.sub(r"[-_]+", " ", base)
    return base.strip().title()


def _title_from_html(html: str) -> str:
    m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.I)
    if not m:
        return ""
    title = re.sub(r"\s+", " ", m.group(1)).strip()
    for sep in ("|", "–", "-", "·", ":"):
        if sep in title:
            title = title.split(sep)[0].strip()
    if len(title) > 80:
        title = title[:80].strip()
    return title


def _should_skip(host: str) -> bool:
    base = host.lower()
    if base.startswith("www."):
        base = base[4:]
    if base in SKIP_HOSTS:
        return True
    return any(base.endswith("." + s) for s in SKIP_HOSTS)


async def scrape_site_for_email(
    page,
    website_url: str,
    timeout_ms: int = 5_000,
) -> SiteScrapeResult:
    """
    Visit a business website + contact pages, returning email and company name.
    Uses httpx first, Playwright as fallback.
    """
    url = (website_url or "").strip()
    if not url:
        return SiteScrapeResult()
    if not url.startswith("http"):
        url = "https://" + url

    try:
        host = urlparse(url).netloc
    except ValueError:
        return SiteScrapeResult()
    if not host or _should_skip(host):
        return SiteScrapeResult()

    domain = normalize_domain(url)
    result = SiteScrapeResult(website=url, company_name=domain_to_company(domain))

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_ms / 1000.0, connect=3.0),
            follow_redirects=True,
            verify=False,
            headers=headers,
        ) as client:
            for path in CONTACT_PATHS:
                target = urljoin(url, path) if path else url
                try:
                    res = await client.get(target)
                    if res.status_code != 200:
                        continue
                    title = _title_from_html(res.text)
                    if title and not result.company_name:
                        result.company_name = title
                    elif title and result.company_name == domain_to_company(domain):
                        result.company_name = title
                    emails = _parse(res.text)
                    if emails:
                        result.email = emails[0]
                        result.website = str(res.url)
                        return result
                except Exception:
                    continue
    except Exception:
        pass

    if page:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            html = await page.content()
            title = _title_from_html(html)
            if title:
                result.company_name = title
            emails = _parse(html)
            if emails:
                result.email = emails[0]
                result.website = page.url
        except Exception:
            pass

    return result


async def find_email_on_site(page, website_url: str, timeout_ms: int = 5_000) -> str:
    """Backward-compatible wrapper."""
    scraped = await scrape_site_for_email(page, website_url, timeout_ms=timeout_ms)
    return scraped.email
