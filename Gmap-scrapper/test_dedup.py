"""
Unit tests for email/domain deduplication — no network required.
Run: python3 test_dedup.py
"""

from __future__ import annotations

import sys
import unittest

# Allow imports from this folder
sys.path.insert(0, ".")

from email_finder import _merge_targets, SiteTarget  # noqa: E402
from email_scraper import normalize_domain  # noqa: E402


def dedupe_emails_found(
    results: list[tuple[str, str]],
    skip_emails: set[str] | None = None,
    skip_domains: set[str] | None = None,
) -> tuple[list[tuple[str, str]], dict[str, int]]:
    """
    Mirror production dedup: skip known domains/emails, keep first email per address.
    results: [(domain, email), ...]
    """
    skip_emails = skip_emails or set()
    skip_domains = skip_domains or set()
    seen_emails: set[str] = set()
    out: list[tuple[str, str]] = []
    stats = {"skipped_domain": 0, "skipped_known_email": 0, "skipped_dup_email": 0, "kept": 0}

    for domain, email in results:
        if domain in skip_domains:
            stats["skipped_domain"] += 1
            continue
        if not email:
            continue
        el = email.lower()
        if el in skip_emails:
            stats["skipped_known_email"] += 1
            continue
        if el in seen_emails:
            stats["skipped_dup_email"] += 1
            continue
        seen_emails.add(el)
        out.append((domain, email))
        stats["kept"] += 1

    return out, stats


class DedupTests(unittest.TestCase):
    def test_merge_targets_by_domain(self):
        maps = [
            SiteTarget("https://www.acme.com", "maps"),
            SiteTarget("https://acme.com/contact", "maps"),
        ]
        google = [SiteTarget("https://acme.com/about", "google")]
        merged = _merge_targets(maps, google, max_sites=100)
        self.assertEqual(len(merged), 1)
        self.assertEqual(normalize_domain(merged[0].website), "acme.com")

    def test_email_dedup_within_job(self):
        raw = [
            ("a.com", "info@a.com"),
            ("b.com", "info@a.com"),  # duplicate email
            ("c.com", "hello@c.com"),
        ]
        kept, stats = dedupe_emails_found(raw)
        self.assertEqual(len(kept), 2)
        self.assertEqual(stats["skipped_dup_email"], 1)

    def test_skip_known_from_database(self):
        raw = [
            ("old.com", "known@old.com"),
            ("new.com", "fresh@new.com"),
        ]
        kept, stats = dedupe_emails_found(
            raw,
            skip_emails={"known@old.com"},
            skip_domains={"blocked.com"},
        )
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0][1], "fresh@new.com")
        self.assertEqual(stats["skipped_known_email"], 1)

    def test_throughput_estimate_10k(self):
        """Rough daily capacity model."""
        sites_per_job = 1000
        jobs_per_day = 12
        hit_rate = 0.25  # 25% of sites yield an email
        concurrent = 6
        seconds_per_site = 4

        sites_per_day = sites_per_job * jobs_per_day
        emails_per_day = int(sites_per_day * hit_rate)
        hours_scraping = (sites_per_day * seconds_per_site) / concurrent / 3600

        print(f"\n--- Capacity estimate ---")
        print(f"  {jobs_per_day} jobs × {sites_per_job} sites = {sites_per_day:,} sites/day")
        print(f"  @ {hit_rate:.0%} email hit rate ≈ {emails_per_day:,} emails/day")
        print(f"  Scrape time ≈ {hours_scraping:.1f} hours (6 parallel workers)")

        self.assertGreaterEqual(emails_per_day, 2500)
        self.assertLessEqual(emails_per_day, 5000)  # realistic with 12 jobs


if __name__ == "__main__":
    unittest.main(verbosity=2)
