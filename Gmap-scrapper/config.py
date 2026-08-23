"""
Configuration — Google Maps Lead Scraper
High-Speed & Parallel Architecture
"""

# ─── Browser (always headless — invisible) ───────────────────────────
HEADLESS = True
BROWSER_TIMEOUT = 30_000

# ─── Concurrency & Parallel Extraction ──────────────────────────────
CONCURRENCY = int(__import__("os").environ.get("SCRAPER_CONCURRENCY", "10"))

# ─── Scraping Volume & Speeds ────────────────────────────────────────
MAX_SCROLLS = 100                     # max scrolls per list
SCROLL_PAUSE = 0.5                    # seconds pause between scrolls
MAX_LEADS_PER_SEARCH = 1000           # hard cap per query (raise via env for batch runs)
DETAIL_DELAY_MIN = 0.1                # min seconds between detail extractions
DETAIL_DELAY_MAX = 0.4                # max seconds between detail extractions

# ─── Grid / Deep Scrape ─────────────────────────────────────────────
GRID_SIZE = 3                         # 3×3 = 9 zones
GRID_RADIUS_KM = 8                    # km from city centre to grid edge
GRID_ZOOM = 14                        # Google Maps zoom level per cell

# ─── Email Extraction ────────────────────────────────────────────────
EMAIL_MAX_SITES = 100                 # max business websites visited to hunt emails
EMAIL_VISIT_TIMEOUT = 5               # seconds per website HTTP visit

# ─── Output ──────────────────────────────────────────────────────────
OUTPUT_DIR = "output"
OUTPUT_FORMAT = "both"                # always CSV + Excel
