from __future__ import annotations
"""
Google Maps Scraper — High-Speed Headless Playwright Engine with Concurrency
"""

import asyncio
import math
import random
import re

from playwright.async_api import (
    async_playwright,
    Page,
    BrowserContext,
    TimeoutError as PwTimeout,
)
from rich.console import Console
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    MofNCompleteColumn,
    TimeElapsedColumn,
)

from models import Lead
from email_scraper import find_email_on_site
import config

console = Console()

# ─── Selectors ───────────────────────────────────────────────────────
SEL_SEARCHBOX = "input[name='q']"
SEL_FEED = "[role='feed']"
SEL_LISTING = "a[href*='/maps/place/']"
SEL_END = "span.HlvSq"
SEL_NAME = "h1.DUwDvf"
SEL_CATEGORY = "button.DkEaL"
SEL_RATING = "div.F7nice span[aria-hidden='true']"
SEL_REVIEW = "div.F7nice span[aria-label*='review']"
SEL_PRICE = "span[aria-label*='Price']"
SEL_INFO_BTN = "button[data-item-id]"
SEL_INFO_LINK = "a[data-item-id]"


def _build_grid(centre_lat: float, centre_lng: float) -> list[tuple[float, float]]:
    """Create a grid of (lat, lng) points around the city centre."""
    n = config.GRID_SIZE
    r_km = config.GRID_RADIUS_KM

    lat_step = (r_km * 2 / n) / 111.0
    lng_step = (r_km * 2 / n) / (111.0 * math.cos(math.radians(centre_lat)))

    points: list[tuple[float, float]] = []
    start_lat = centre_lat - (n - 1) / 2 * lat_step
    start_lng = centre_lng - (n - 1) / 2 * lng_step

    for row in range(n):
        for col in range(n):
            lat = round(start_lat + row * lat_step, 6)
            lng = round(start_lng + col * lng_step, 6)
            points.append((lat, lng))

    return points


def _extract_coords_from_url(url: str) -> tuple[float, float] | None:
    """Pull @lat,lng from a Google Maps URL."""
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None


class GoogleMapsScraper:

    URL = "https://www.google.com/maps"

    def __init__(self):
        self.leads: list[Lead] = []
        self._seen_keys: set[str] = set()
        self._seen_hrefs: set[str] = set()
        self.include_emails: bool = False
        self._email_visits: int = 0
        self.on_lead = None

    async def deep_scrape(
        self,
        niche: str,
        city: str,
        include_emails: bool = False,
        max_leads: int | None = None,
        on_lead=None,
    ) -> list[Lead]:
        self.include_emails = include_emails
        self.on_lead = on_lead
        query = f"{niche} in {city}"
        grid_n = config.GRID_SIZE
        total_zones = grid_n * grid_n

        console.print(f"\n[bold cyan]🔍 Deep Scraping:[/] [yellow]{query}[/]")
        console.print(
            f"[dim]   Grid: {grid_n}×{grid_n} = {total_zones} zones  "
            f"| Radius: {config.GRID_RADIUS_KM} km  "
            f"| Zoom: {config.GRID_ZOOM}[/]\n"
        )

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                locale="en-US",
                timezone_id="America/New_York",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
            )
            page = await ctx.new_page()
            page.set_default_timeout(config.BROWSER_TIMEOUT)

            try:
                await self._open(page)
                await self._search(page, query)
                centre = _extract_coords_from_url(page.url)

                if not centre:
                    console.print("[yellow]  ⚠ Could not detect city centre, using single search.[/]")
                    hrefs = await self._scroll_and_collect(page)
                    await self._extract_all(ctx, hrefs)
                else:
                    lat, lng = centre
                    console.print(f"[dim]  → City centre: {lat}, {lng}[/]")

                    first_hrefs = await self._scroll_and_collect(page)
                    for h in first_hrefs:
                        self._seen_hrefs.add(h)

                    grid = _build_grid(lat, lng)
                    console.print(f"\n[bold]  → Searching {total_zones} grid zones…[/]\n")

                    with Progress(
                        SpinnerColumn(),
                        TextColumn("[progress.description]{task.description}"),
                        BarColumn(),
                        MofNCompleteColumn(),
                        TimeElapsedColumn(),
                        console=console,
                    ) as prog:
                        task = prog.add_task("Grid zones…", total=total_zones)

                        for zi, (glat, glng) in enumerate(grid):
                            zone_url = (
                                f"https://www.google.com/maps/search/"
                                f"{niche.replace(' ', '+')}/"
                                f"@{glat},{glng},{config.GRID_ZOOM}z"
                            )
                            try:
                                await page.goto(zone_url, wait_until="domcontentloaded", timeout=20_000)
                                await asyncio.sleep(1.5)

                                zone_hrefs = await self._scroll_and_collect(page, silent=True)
                                new = sum(1 for h in zone_hrefs if h not in self._seen_hrefs)
                                for h in zone_hrefs:
                                    self._seen_hrefs.add(h)

                                prog.update(
                                    task,
                                    completed=zi + 1,
                                    description=f"Zone {zi+1}: +{new} new  (total {len(self._seen_hrefs)})",
                                )
                            except Exception:
                                prog.update(
                                    task,
                                    completed=zi + 1,
                                    description=f"[red]Zone {zi+1} failed[/]",
                                )

                    console.print(
                        f"\n[bold]  → {len(self._seen_hrefs)} total unique listings across all zones[/]\n"
                    )

                    all_hrefs = list(self._seen_hrefs)
                    if len(all_hrefs) > config.MAX_LEADS_PER_SEARCH:
                        all_hrefs = all_hrefs[: config.MAX_LEADS_PER_SEARCH]
                    if max_leads and len(all_hrefs) > max_leads:
                        all_hrefs = all_hrefs[:max_leads]

                    await self._extract_all(ctx, all_hrefs)

            except Exception as e:
                console.print(f"[bold red]❌ Error: {e}[/]")
            finally:
                await browser.close()

        console.print(
            f"\n[bold green]✅ Deep scrape complete — {len(self.leads)} unique leads[/]\n"
        )
        return self.leads

    async def scrape(
        self,
        query: str,
        include_emails: bool = False,
        max_leads: int | None = None,
        on_lead=None,
    ) -> list[Lead]:
        self.include_emails = include_emails
        self.on_lead = on_lead
        console.print(f"\n[bold cyan]🔍 Searching:[/] [yellow]{query}[/]\n")

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                locale="en-US",
                timezone_id="America/New_York",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
            )
            page = await ctx.new_page()
            page.set_default_timeout(config.BROWSER_TIMEOUT)

            try:
                await self._open(page)
                await self._search(page, query)
                hrefs = await self._scroll_and_collect(page)
                if max_leads and len(hrefs) > max_leads:
                    hrefs = hrefs[:max_leads]
                await self._extract_all(ctx, hrefs)
            except Exception as e:
                console.print(f"[bold red]❌ Error: {e}[/]")
            finally:
                await browser.close()

        console.print(f"\n[bold green]✅ Scraped {len(self.leads)} unique leads[/]\n")
        return self.leads

    async def _open(self, page: Page):
        console.print("[dim]  → Opening Google Maps (headless)…[/]")
        await page.goto(self.URL, wait_until="networkidle", timeout=30_000)
        await asyncio.sleep(1)

        for sel in [
            "button:has-text('Accept all')",
            "button:has-text('Reject all')",
            "button:has-text('Accept')",
            "form[action*='consent'] button",
            "[aria-label='Accept all']",
            "button:has-text('I agree')",
        ]:
            try:
                btn = page.locator(sel)
                if await btn.count() > 0:
                    await btn.first.click()
                    console.print("[dim]  → Accepted consent dialog[/]")
                    await asyncio.sleep(1)
                    break
            except Exception:
                continue

    async def _search(self, page: Page, query: str):
        console.print("[dim]  → Searching…[/]")

        for attempt in range(3):
            try:
                await page.wait_for_selector(SEL_SEARCHBOX, timeout=15_000)
                break
            except PwTimeout:
                if attempt < 2:
                    console.print("[yellow]  ⚠ Retrying…[/]")
                    await page.goto(self.URL, wait_until="networkidle", timeout=30_000)
                    await asyncio.sleep(2)
                else:
                    raise Exception("Search box not found after 3 attempts")

        box = page.locator(SEL_SEARCHBOX)
        await box.click()
        await box.fill(query)
        await page.keyboard.press("Enter")
        await asyncio.sleep(2)

        try:
            await page.wait_for_selector(SEL_FEED, timeout=15_000)
        except PwTimeout:
            await asyncio.sleep(3)

    async def _scroll_and_collect(self, page: Page, silent: bool = False) -> list[str]:
        if not silent:
            console.print("[dim]  → Scrolling to load all results…[/]")

        feed = page.locator(SEL_FEED)
        if await feed.count() == 0:
            feed = page.locator("div.m6QErb.DxyBCb.kA9KIf.dS8AEf")
        if await feed.count() == 0:
            return []

        prev, stale = 0, 0

        for _ in range(config.MAX_SCROLLS):
            try:
                await feed.evaluate("el => el.scrollTop = el.scrollHeight")
            except Exception:
                break
            await asyncio.sleep(config.SCROLL_PAUSE)

            cur = await page.locator(SEL_LISTING).count()

            if await page.locator(SEL_END).count() > 0:
                break
            if cur >= config.MAX_LEADS_PER_SEARCH:
                break
            if cur == prev:
                stale += 1
                if stale >= 4:
                    break
            else:
                stale = 0
            prev = cur

        links = page.locator(SEL_LISTING)
        total = await links.count()
        hrefs, seen = [], set()
        for i in range(total):
            href = await links.nth(i).get_attribute("href") or ""
            if href and href not in seen:
                seen.add(href)
                hrefs.append(href)

        if not silent:
            console.print(f"[dim]  → {len(hrefs)} listings found[/]")
        return hrefs

    async def _extract_all(self, ctx: BrowserContext, hrefs: list[str]):
        if not hrefs:
            return

        concurrency = getattr(config, "CONCURRENCY", 6)
        console.print(f"[dim]  → Parallel extraction of {len(hrefs)} listings ({concurrency} workers)…[/]")

        sem = asyncio.Semaphore(concurrency)
        lock = asyncio.Lock()
        completed_count = 0

        num_workers = min(concurrency, len(hrefs))
        worker_pages = [await ctx.new_page() for _ in range(num_workers)]
        page_queue: asyncio.Queue[Page] = asyncio.Queue()
        for p in worker_pages:
            p.set_default_timeout(config.BROWSER_TIMEOUT)
            await page_queue.put(p)

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            TimeElapsedColumn(),
            console=console,
        ) as prog:
            task = prog.add_task("Extracting…", total=len(hrefs))

            async def process_one(href: str):
                nonlocal completed_count
                async with sem:
                    worker_page = await page_queue.get()
                    try:
                        await worker_page.goto(href, wait_until="domcontentloaded", timeout=15_000)
                        await asyncio.sleep(random.uniform(config.DETAIL_DELAY_MIN, config.DETAIL_DELAY_MAX))
                        lead = await self._extract_one(worker_page, href)

                        if lead and lead.name:
                            key = f"{lead.name}|{lead.phone}"
                            async with lock:
                                is_new = key not in self._seen_keys
                                if is_new:
                                    self._seen_keys.add(key)

                            if is_new:
                                if self.include_emails and lead.website and self._email_visits < config.EMAIL_MAX_SITES:
                                    async with lock:
                                        self._email_visits += 1
                                    try:
                                        lead.email = await find_email_on_site(
                                            worker_page,
                                            lead.website,
                                            timeout_ms=config.EMAIL_VISIT_TIMEOUT * 1000,
                                        )
                                    except Exception:
                                        lead.email = ""

                                async with lock:
                                    self.leads.append(lead)
                                    if self.on_lead:
                                        try:
                                            self.on_lead(lead)
                                        except Exception:
                                            pass
                                    prog.update(task, description=f"✔ {lead.name[:40]}")
                    except Exception:
                        pass
                    finally:
                        async with lock:
                            completed_count += 1
                            prog.update(task, completed=completed_count)
                        await page_queue.put(worker_page)

            await asyncio.gather(*(process_one(h) for h in hrefs))

        for p in worker_pages:
            try:
                await p.close()
            except Exception:
                pass

    async def _extract_one(self, page: Page, url: str) -> Lead | None:
        lead = Lead(google_maps_url=url)
        try:
            try:
                await page.wait_for_selector(SEL_NAME, timeout=8_000)
            except PwTimeout:
                return None

            el = page.locator(SEL_NAME)
            if await el.count():
                lead.name = (await el.first.inner_text()).strip()

            el = page.locator(SEL_CATEGORY)
            if await el.count():
                lead.category = (await el.first.inner_text()).strip()

            el = page.locator(SEL_RATING)
            if await el.count():
                try:
                    lead.rating = float((await el.first.inner_text()).strip())
                except ValueError:
                    pass

            el = page.locator(SEL_REVIEW)
            if await el.count():
                label = (await el.first.get_attribute("aria-label")) or ""
                nums = re.findall(r"[\d,]+", label)
                if nums:
                    lead.review_count = int(nums[0].replace(",", ""))

            el = page.locator(SEL_PRICE)
            if await el.count():
                lead.price_range = (await el.first.inner_text()).strip()

            btns = page.locator(SEL_INFO_BTN)
            for j in range(await btns.count()):
                btn = btns.nth(j)
                iid = (await btn.get_attribute("data-item-id")) or ""
                aria = (await btn.get_attribute("aria-label")) or ""
                text = aria.strip()

                if iid.startswith("address") or "address" in iid:
                    lead.address = text.replace("Address: ", "")
                elif iid.startswith("phone") or "phone" in iid:
                    lead.phone = text.replace("Phone: ", "")
                elif iid.startswith("authority"):
                    lead.website = text.replace("Website: ", "")
                elif iid.startswith("oh"):
                    lead.hours = text

            if not lead.website:
                el = page.locator(SEL_INFO_LINK)
                for j in range(await el.count()):
                    link = el.nth(j)
                    iid = (await link.get_attribute("data-item-id")) or ""
                    if iid.startswith("authority"):
                        lead.website = (await link.get_attribute("href")) or ""
                        break

            pid = re.search(r"place/([^/]+)", url)
            if pid:
                lead.place_id = pid.group(1)

            coords = re.findall(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
            if coords:
                lead.latitude = float(coords[0][0])
                lead.longitude = float(coords[0][1])

            return lead
        except Exception:
            return None


async def scrape_google_maps(
    query: str,
    include_emails: bool = False,
    max_leads: int | None = None,
    on_lead=None,
) -> list[Lead]:
    """Single search (quick)."""
    scraper = GoogleMapsScraper()
    return await scraper.scrape(query, include_emails, max_leads, on_lead)


async def deep_scrape_google_maps(
    niche: str,
    city: str,
    include_emails: bool = False,
    max_leads: int | None = None,
    on_lead=None,
) -> list[Lead]:
    """Grid-based deep scrape — covers the entire city."""
    scraper = GoogleMapsScraper()
    return await scraper.deep_scrape(niche, city, include_emails, max_leads, on_lead)
