"""
Email Finder — discover business websites (Maps / Google / Bing) then extract emails.
"""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass

from playwright.async_api import async_playwright

import config
import maps_scraper
from email_scraper import scrape_site_for_email
from models import Lead
from search_scraper import discover_search_urls, domain_to_company, normalize_domain


@dataclass
class SiteTarget:
    website: str
    source: str


def _merge_targets(
    *groups: list[SiteTarget],
    max_sites: int,
    skip_domains: set[str] | None = None,
) -> list[SiteTarget]:
    seen: set[str] = set()
    merged: list[SiteTarget] = []
    skip = skip_domains or set()
    skipped = 0
    for group in groups:
        for item in group:
            domain = normalize_domain(item.website)
            if not domain or domain in seen or domain in skip:
                if domain and domain in skip:
                    skipped += 1
                continue
            seen.add(domain)
            merged.append(item)
            if len(merged) >= max_sites:
                return merged
    return merged


async def _discover_maps_websites(
    query: str,
    max_listings: int,
    skip_domains: set[str] | None = None,
) -> list[SiteTarget]:
    found: list[SiteTarget] = []
    skip = skip_domains or set()

    def on_website(website: str) -> None:
        domain = normalize_domain(website)
        if domain and domain in skip:
            return
        found.append(SiteTarget(website=website, source="maps"))

    await maps_scraper.scrape_google_maps_websites(
        query,
        max_leads=max_listings,
        on_website=on_website,
        skip_domains=skip,
    )
    return found


async def _discover_search_websites(
    query: str,
    engines: list[str],
    max_per_engine: int,
) -> list[SiteTarget]:
    targets: list[SiteTarget] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        )
        page = await ctx.new_page()
        page.set_default_timeout(config.BROWSER_TIMEOUT)
        try:
            results = await discover_search_urls(page, query, engines, max_per_engine)
            for engine, urls in results.items():
                for url in urls:
                    targets.append(SiteTarget(website=url, source=engine))
        finally:
            await browser.close()
    return targets


async def _extract_emails(
    targets: list[SiteTarget],
    on_lead=None,
    skip_emails: set[str] | None = None,
) -> list[Lead]:
    if not targets:
        return []

    leads: list[Lead] = []
    seen_emails: set[str] = set(skip_emails or set())
    concurrency = getattr(config, "CONCURRENCY", 6)
    sem = asyncio.Semaphore(concurrency)
    lock = asyncio.Lock()
    stats = {"dup_email": 0, "known_email": 0, "no_email": 0}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        )
        page_queue: asyncio.Queue = asyncio.Queue()
        workers = [await ctx.new_page() for _ in range(min(concurrency, len(targets)))]
        for p in workers:
            p.set_default_timeout(config.BROWSER_TIMEOUT)
            await page_queue.put(p)

        async def process_one(target: SiteTarget) -> None:
            async with sem:
                page = await page_queue.get()
                try:
                    await asyncio.sleep(random.uniform(0.05, 0.2))
                    result = await scrape_site_for_email(
                        page,
                        target.website,
                        timeout_ms=config.EMAIL_VISIT_TIMEOUT * 1000,
                    )
                    email = (result.email or "").strip().lower()
                    if not email:
                        async with lock:
                            stats["no_email"] += 1
                        return

                    async with lock:
                        if email in seen_emails:
                            if email in (skip_emails or set()):
                                stats["known_email"] += 1
                            else:
                                stats["dup_email"] += 1
                            return
                        seen_emails.add(email)

                    domain = normalize_domain(target.website)
                    name = result.company_name or domain_to_company(domain)
                    lead = Lead(
                        name=name,
                        website=result.website or target.website,
                        email=email,
                        source=target.source,
                    )
                    async with lock:
                        leads.append(lead)
                        if on_lead:
                            try:
                                on_lead(lead)
                            except Exception:
                                pass
                except Exception:
                    pass
                finally:
                    await page_queue.put(page)

        await asyncio.gather(*(process_one(t) for t in targets))

        for p in workers:
            try:
                await p.close()
            except Exception:
                pass
        await browser.close()

    return leads


async def run_email_finder(
    query: str,
    source: str = "all",
    max_leads: int = 300,
    on_lead=None,
    skip_emails: list[str] | None = None,
    skip_domains: list[str] | None = None,
) -> list[Lead]:
    """
    source: maps | google | bing | all
    skip_emails / skip_domains: already scraped — never visit or return again
    """
    source = (source or "all").lower()
    max_leads = max(10, min(max_leads, config.MAX_LEADS_PER_SEARCH))

    known_emails = {e.strip().lower() for e in (skip_emails or []) if e and "@" in e}
    known_domains = {d.strip().lower() for d in (skip_domains or []) if d}

    maps_targets: list[SiteTarget] = []
    search_targets: list[SiteTarget] = []

    if source in ("maps", "all"):
        maps_targets = await _discover_maps_websites(query, max_leads, known_domains)

    engines: list[str] = []
    if source in ("google", "all"):
        engines.append("google")
    if source in ("bing", "all"):
        engines.append("bing")
    if engines:
        per_engine = max(20, max_leads // max(len(engines), 1))
        search_targets = await _discover_search_websites(query, engines, per_engine)

    if source == "google":
        maps_targets = []
    elif source == "bing":
        maps_targets = []
        search_targets = [t for t in search_targets if t.source == "bing"]
    elif source == "maps":
        search_targets = []

    targets = _merge_targets(
        maps_targets,
        search_targets,
        max_sites=max_leads,
        skip_domains=known_domains,
    )
    return await _extract_emails(targets, on_lead=on_lead, skip_emails=known_emails)
