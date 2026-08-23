"""
Web search URL discovery — Google and Bing organic results.
Collects business website URLs for email extraction.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import parse_qs, unquote, urlparse

from playwright.async_api import Page, TimeoutError as PwTimeout

from email_scraper import SKIP_HOSTS, _should_skip

GOOGLE_URL = "https://www.google.com/search"
BING_URL = "https://www.bing.com/search"

JUNK_PATH = re.compile(
    r"(/search[/?]|/images[/?]|/maps[/?]|/news[/?]|/video[/?]|/shopping[/?])",
    re.I,
)


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


def _unwrap_google_redirect(href: str) -> str:
    if "/url?" in href and "google." in href:
        qs = parse_qs(urlparse(href).query)
        target = qs.get("q", [""])[0]
        return unquote(target) if target else href
    return href


def _is_usable_site(url: str) -> bool:
    if not url or not url.startswith("http"):
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = parsed.netloc.lower()
    if not host or _should_skip(host):
        return False
    if JUNK_PATH.search(parsed.path or ""):
        return False
    return True


async def _collect_links(page: Page, selector: str, limit: int) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    anchors = page.locator(selector)
    count = await anchors.count()
    for i in range(min(count, limit * 3)):
        href = await anchors.nth(i).get_attribute("href") or ""
        href = _unwrap_google_redirect(href.strip())
        if not _is_usable_site(href):
            continue
        domain = normalize_domain(href)
        if not domain or domain in seen:
            continue
        seen.add(domain)
        if not href.startswith("http"):
            href = "https://" + domain
        urls.append(href)
        if len(urls) >= limit:
            break
    return urls


async def search_google(page: Page, query: str, max_results: int = 50) -> list[str]:
    q = f"{query} contact email"
    url = f"{GOOGLE_URL}?q={q.replace(' ', '+')}&num={min(max_results, 50)}"
    await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
    await asyncio.sleep(1.5)

    for sel in [
        "button:has-text('Accept all')",
        "button:has-text('Reject all')",
        "button:has-text('I agree')",
    ]:
        try:
            btn = page.locator(sel)
            if await btn.count() > 0:
                await btn.first.click()
                await asyncio.sleep(0.8)
                break
        except Exception:
            continue

    selectors = [
        "div#search a[href^='http']",
        "a[href^='/url?q=']",
        "div.g a[href^='http']",
    ]
    for sel in selectors:
        try:
            found = await _collect_links(page, sel, max_results)
            if found:
                return found
        except Exception:
            continue
    return []


async def search_bing(page: Page, query: str, max_results: int = 50) -> list[str]:
    q = f"{query} contact email"
    url = f"{BING_URL}?q={q.replace(' ', '+')}"
    await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
    await asyncio.sleep(1.2)

    selectors = [
        "li.b_algo h2 a[href^='http']",
        "#b_results h2 a[href^='http']",
        "a[href^='http']",
    ]
    for sel in selectors:
        try:
            found = await _collect_links(page, sel, max_results)
            if found:
                return found
        except Exception:
            continue
    return []


async def discover_search_urls(
    page: Page,
    query: str,
    engines: list[str],
    max_per_engine: int,
) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for engine in engines:
        try:
            if engine == "google":
                out["google"] = await search_google(page, query, max_per_engine)
            elif engine == "bing":
                out["bing"] = await search_bing(page, query, max_per_engine)
        except PwTimeout:
            out[engine] = []
        except Exception:
            out[engine] = []
    return out
