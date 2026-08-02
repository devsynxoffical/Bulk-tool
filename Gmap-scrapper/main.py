"""
Google Maps Lead Scraper — Terminal Only
========================================
Everything runs in the terminal. Chromium runs 100 % headless (invisible).
  • Select niche + city interactively
  • Deep-scrape mode: grid-based search covers the ENTIRE city
  • Exports to CSV + Excel

Usage:
  python main.py                                     # interactive
  python main.py "restaurants" "Islamabad"            # deep scrape
  python main.py --quick "restaurants in Islamabad"   # single search
  python main.py --file queries.txt                   # from file (quick)
"""

import argparse
import asyncio
import sys

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.prompt import Prompt, IntPrompt, Confirm

from maps_scraper import scrape_google_maps, deep_scrape_google_maps
from exporter import export_leads
from models import Lead
import config

console = Console()

BANNER = r"""
   ____                       __  __
  / ___| _ __ ___   __ _ _ __|  \/  | __ _ _ __  ___
 | |  _ | '_ ` _ \ / _` | '_ \ |\/| |/ _` | '_ \/ __|
 | |_| || | | | | | (_| | |_) | |  | | (_| | |_) \__ \
  \____||_| |_| |_|\__,_| .__/|_|  |_|\__,_| .__/|___/
                         |_|  Lead Scraper   |_|
"""


def print_banner():
    console.print(f"[bold cyan]{BANNER}[/]")
    console.print(Panel(
        "[bold]Google Maps DEVSYNX Scraper[/]\n"
        "Select niche & city → Deep Scrape (grid) → Export CSV + Excel\n"
        "[dim]Chromium runs invisible in the background — no window opens.[/]",
        border_style="cyan",
    ))


def print_summary(leads: list[Lead]):
    if not leads:
        console.print("[yellow]No leads scraped.[/]")
        return

    tbl = Table(
        title="📊 Results Preview",
        show_header=True,
        header_style="bold cyan",
        border_style="dim",
    )
    tbl.add_column("#", style="dim", width=4)
    tbl.add_column("Name", style="bold", max_width=30)
    tbl.add_column("Phone", max_width=20)
    tbl.add_column("Category", max_width=20)
    tbl.add_column("Rating", justify="center", width=8)
    tbl.add_column("Address", max_width=35)

    for i, l in enumerate(leads[:30], 1):
        rating = f"⭐ {l.rating}" if l.rating else "-"
        tbl.add_row(
            str(i),
            l.name[:28] if l.name else "-",
            l.phone or "-",
            (l.category[:18]) if l.category else "-",
            rating,
            (l.address[:33] + "…") if l.address and len(l.address) > 35 else (l.address or "-"),
        )

    if len(leads) > 30:
        tbl.add_row("…", f"and {len(leads) - 30} more", "", "", "", "")

    console.print()
    console.print(tbl)

    total = len(leads)
    wp = sum(1 for l in leads if l.phone)
    we = sum(1 for l in leads if l.email)
    ww = sum(1 for l in leads if l.website)
    wr = sum(1 for l in leads if l.rating)
    wa = sum(1 for l in leads if l.address)
    pct = lambda n: f"{n * 100 // max(total, 1)}%"

    console.print()
    console.print(Panel(
        f"[bold]Total Leads :[/] {total}\n"
        f"[bold]With Phone  :[/] {wp}  ({pct(wp)})\n"
        f"[bold]With Email  :[/] {we}  ({pct(we)})\n"
        f"[bold]With Website:[/] {ww}  ({pct(ww)})\n"
        f"[bold]With Rating :[/] {wr}  ({pct(wr)})\n"
        f"[bold]With Address:[/] {wa}  ({pct(wa)})",
        title="📈 Stats",
        border_style="green",
    ))


# ═══════════════════════════════════════════════════════════════════════
#  Pipeline
# ═══════════════════════════════════════════════════════════════════════

async def run_deep(niche: str, city: str) -> list[Lead]:
    """Grid-based deep scrape — covers the entire city."""
    leads = await deep_scrape_google_maps(niche, city)
    if not leads:
        console.print("[yellow]  ⚠ No leads found.[/]")
        return []
    query_label = f"{niche} in {city}"
    export_leads(leads, query_label)
    print_summary(leads)
    return leads


async def run_quick(query: str) -> list[Lead]:
    """Single search — fast but limited to ~120 results."""
    leads = await scrape_google_maps(query)
    if not leads:
        console.print("[yellow]  ⚠ No leads found.[/]")
        return []
    export_leads(leads, query)
    print_summary(leads)
    return leads


# ═══════════════════════════════════════════════════════════════════════
#  Interactive mode — select niche + city in the terminal
# ═══════════════════════════════════════════════════════════════════════

POPULAR_NICHES = [
    "Restaurants", "Dentists", "Plumbers", "Gyms", "Hotels",
    "Car Dealers", "Real Estate Agents", "Lawyers", "Doctors",
    "Beauty Salons", "Coffee Shops", "Electricians", "Pet Shops",
    "Pharmacies", "Clothing Stores",
]


def interactive_mode():
    print_banner()

    console.print("\n[bold]── Step 1: Select your niche ──[/]\n")
    for i, n in enumerate(POPULAR_NICHES, 1):
        console.print(f"  [cyan]{i:>2}.[/] {n}")
    console.print(f"  [cyan] 0.[/] Enter custom niche")
    console.print()

    choice = IntPrompt.ask("[bold]Pick a number (or 0 for custom)", default=0)
    if 1 <= choice <= len(POPULAR_NICHES):
        niche = POPULAR_NICHES[choice - 1]
    else:
        niche = Prompt.ask("[bold]Enter your niche")

    console.print(f"\n[green]  ✔ Niche:[/] {niche}\n")

    console.print("[bold]── Step 2: Enter city / location ──[/]\n")
    city = Prompt.ask("[bold]City or area")
    console.print(f"\n[green]  ✔ City:[/] {city}\n")

    console.print("[bold]── Step 3: Scrape settings ──[/]\n")

    console.print(
        "  [cyan]1.[/] Deep scrape — grid-based, covers the ENTIRE city (recommended)\n"
        "  [cyan]2.[/] Quick scrape — single search (~120 results max)\n"
    )
    mode = IntPrompt.ask("[bold]Pick mode", default=1)

    if mode == 1:
        grid = IntPrompt.ask(
            f"[bold]Grid size (N×N zones, default {config.GRID_SIZE})",
            default=config.GRID_SIZE,
        )
        config.GRID_SIZE = grid

        radius = IntPrompt.ask(
            f"[bold]Search radius in km from centre (default {config.GRID_RADIUS_KM})",
            default=config.GRID_RADIUS_KM,
        )
        config.GRID_RADIUS_KM = radius

        total_zones = grid * grid
        console.print()
        console.print(Panel(
            f"[bold]Niche    :[/] {niche}\n"
            f"[bold]City     :[/] {city}\n"
            f"[bold]Mode     :[/] Deep scrape ({total_zones} zones, {radius} km radius)\n"
            f"[bold]Output   :[/] CSV + Excel\n"
            f"[dim]Chromium runs headless — no window will open.[/]",
            title="🔍 Ready to deep scrape",
            border_style="yellow",
        ))

        if not Confirm.ask("\n[bold]Start deep scraping?", default=True):
            console.print("[dim]Cancelled.[/]")
            return

        asyncio.run(run_deep(niche, city))

    else:
        query = f"{niche} in {city}"
        console.print()
        console.print(Panel(
            f"[bold]Query  :[/] {query}\n"
            f"[bold]Output :[/] CSV + Excel\n"
            f"[dim]Chromium runs headless — no window will open.[/]",
            title="🔍 Ready to quick scrape",
            border_style="yellow",
        ))

        if not Confirm.ask("\n[bold]Start scraping?", default=True):
            console.print("[dim]Cancelled.[/]")
            return

        asyncio.run(run_quick(query))

    while Confirm.ask("\n[bold]Scrape another niche/city?", default=False):
        niche = Prompt.ask("[bold]Niche")
        city = Prompt.ask("[bold]City")
        m = IntPrompt.ask("[bold]1=Deep, 2=Quick", default=1)
        if m == 1:
            asyncio.run(run_deep(niche, city))
        else:
            asyncio.run(run_quick(f"{niche} in {city}"))

    console.print("\n[bold green]🎉 Done — check the 'output/' folder.[/]\n")


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="🗺️  Google Maps Lead Scraper (headless — no visible browser)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py                                     # interactive
  python main.py "restaurants" "Islamabad"            # deep scrape (niche + city)
  python main.py --quick "restaurants in Islamabad"   # single search (~120 max)
  python main.py --file queries.txt                   # from file (quick mode)
  python main.py "dentists" "London" --grid 4 --radius 10
        """,
    )
    parser.add_argument("args", nargs="*",
                        help="<niche> <city> for deep scrape  |  with --quick: full query string")
    parser.add_argument("--quick", "-q", action="store_true",
                        help="Quick mode — single search instead of grid")
    parser.add_argument("--file", "-f", type=str,
                        help="Text file with one query per line (quick mode)")
    parser.add_argument("--grid", "-g", type=int,
                        help=f"Grid size (default {config.GRID_SIZE})")
    parser.add_argument("--radius", "-r", type=int,
                        help=f"Grid radius km (default {config.GRID_RADIUS_KM})")
    parser.add_argument("--output", "-o", choices=["csv", "excel", "both"],
                        help=f"Output format (default {config.OUTPUT_FORMAT})")

    args = parser.parse_args()

    if args.grid:
        config.GRID_SIZE = args.grid
    if args.radius:
        config.GRID_RADIUS_KM = args.radius
    if args.output:
        config.OUTPUT_FORMAT = args.output

    # ── Quick mode: from file or inline queries ──────────────────────
    if args.file:
        try:
            with open(args.file, encoding="utf-8") as fh:
                queries = [l.strip() for l in fh if l.strip()]
            console.print(f"[dim]Loaded {len(queries)} queries from {args.file}[/]")
        except FileNotFoundError:
            console.print(f"[bold red]❌ File not found: {args.file}[/]")
            sys.exit(1)
        print_banner()
        all_leads: list[Lead] = []
        for i, q in enumerate(queries, 1):
            console.print(f"\n[bold magenta]━━━ Query {i}/{len(queries)} ━━━[/]")
            all_leads.extend(asyncio.run(run_quick(q)))
        console.print(f"\n[bold green]🎉 Grand total: {len(all_leads)} leads[/]\n")
        return

    if args.quick and args.args:
        print_banner()
        full_query = " ".join(args.args)
        asyncio.run(run_quick(full_query))
        console.print("\n[bold green]🎉 Done — check the 'output/' folder.[/]\n")
        return

    # ── Deep scrape: two positional args = niche + city ──────────────
    if len(args.args) >= 2 and not args.quick:
        niche = args.args[0]
        city = " ".join(args.args[1:])
        print_banner()
        asyncio.run(run_deep(niche, city))
        console.print("\n[bold green]🎉 Done — check the 'output/' folder.[/]\n")
        return

    # ── No args → interactive ────────────────────────────────────────
    if not args.args:
        interactive_mode()
        return

    # ── Fallback: single arg treated as quick query ──────────────────
    print_banner()
    asyncio.run(run_quick(args.args[0]))
    console.print("\n[bold green]🎉 Done — check the 'output/' folder.[/]\n")


if __name__ == "__main__":
    main()
