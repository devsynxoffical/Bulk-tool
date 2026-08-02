"""
Configuration — Google Maps Lead Scraper
Runs headless (invisible) — no browser window ever opens.
"""

# ─── Browser (always headless — invisible) ───────────────────────────
HEADLESS = True
BROWSER_TIMEOUT = 60_000

# ─── Scraping Volume ─────────────────────────────────────────────────
MAX_SCROLLS = 100                    # scroll until end-of-list or this cap
SCROLL_PAUSE = 1.5                   # seconds between scrolls
MAX_LEADS_PER_SEARCH = 1000          # hard cap per query
DETAIL_DELAY_MIN = 0.5               # min seconds between detail extractions
DETAIL_DELAY_MAX = 1.2               # max seconds between detail extractions

# ─── Grid / Deep Scrape ─────────────────────────────────────────────
# Splits the city into a grid and searches each cell for maximum coverage.
GRID_SIZE = 3                        # 3×3 = 9 zones  (use 4 for 16, 5 for 25)
GRID_RADIUS_KM = 8                   # km from city centre to grid edge
GRID_ZOOM = 14                       # Google Maps zoom level per cell

# ─── Email Extraction ────────────────────────────────────────────────
EMAIL_MAX_SITES = 40            # max business websites visited to hunt emails
EMAIL_VISIT_TIMEOUT = 12        # seconds per website page visit

# ─── Output ──────────────────────────────────────────────────────────
OUTPUT_DIR = "output"
OUTPUT_FORMAT = "both"               # always CSV + Excel
