"""
Email Finder — HTTP service for the WhatsApp Bulk app
=====================================================
Discovers business websites via Google Maps / Google / Bing search,
then extracts contact emails from each site.

Run (from the Gmap-scrapper folder):
  .venv/bin/python server.py          (or from the app root: npm run scraper)

Endpoints
─────────
  POST /api/scrape          body: {"query": "...", "source": "all", "maxLeads": 300}
                            source: maps | google | bing | all
                            → {"jobId": "..."}   (409 if a job is already running)
  GET  /api/jobs/<id>       → {"status", "leads": [...], "stats", "error"}
  GET  /api/jobs/<id>/csv   → CSV download (attachment)
  GET  /api/health          → {"ok": true}
"""

import asyncio
import csv
import io
import json
import os
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import email_finder
import exporter

# Keep the terminal output quiet when running as a service.
exporter.console.quiet = True

HOST = os.environ.get("SCRAPER_HOST", "0.0.0.0")
PORT = int(os.environ.get("SCRAPER_PORT", "8787"))

JOBS: dict[str, dict] = {}
LOCK = threading.Lock()


def _job_id() -> str:
    return uuid.uuid4().hex[:12]


def _make_job(query: str, source: str, max_leads: int, skip_emails: list, skip_domains: list) -> dict:
    job = {
        "id": _job_id(),
        "query": query,
        "source": source,
        "maxLeads": max_leads,
        "skipEmails": skip_emails,
        "skipDomains": skip_domains,
        "status": "running",
        "leads": [],
        "error": None,
    }
    with LOCK:
        JOBS[job["id"]] = job
    return job


def _run_job(job: dict) -> None:
    def on_lead(lead) -> None:
        with LOCK:
            job["leads"].append(lead)

    try:
        asyncio.run(
            email_finder.run_email_finder(
                job["query"],
                source=job["source"],
                max_leads=job["maxLeads"],
                on_lead=on_lead,
                skip_emails=job.get("skipEmails") or [],
                skip_domains=job.get("skipDomains") or [],
            )
        )
        with LOCK:
            job["status"] = "done"
    except Exception as e:  # noqa: BLE001
        with LOCK:
            job["status"] = "error"
            job["error"] = str(e)


def _job_summary(job: dict) -> dict:
    leads = job["leads"]
    return {
        "id": job["id"],
        "query": job["query"],
        "status": job["status"],
        "error": job["error"],
        "stats": {
            "found": len(leads),
            "withWebsite": sum(1 for l in leads if getattr(l, "website", "")),
            "withEmail": sum(1 for l in leads if getattr(l, "email", "")),
            "withPhone": sum(1 for l in leads if getattr(l, "phone", "")),
        },
        "leads": [l.to_dict() for l in leads],
    }


def _job_csv(job: dict) -> str:
    leads = job["leads"]
    if not leads:
        return ""
    rows = [l.to_dict() for l in leads]
    headers = list(rows[0].keys())
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers)
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def _read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return {}


def _send_json(handler: BaseHTTPRequestHandler, obj, status: int = 200) -> None:
    body = json.dumps(obj).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt: str, *args) -> None:  # quiet by default
        pass

    # ── Routes ────────────────────────────────────────────────────

    def do_POST(self) -> None:
        path = self.path.rstrip("/")
        if path == "/api/scrape":
            self._start_job()
        else:
            _send_json(self, {"error": "Not found"}, 404)

    def do_GET(self) -> None:
        path = self.path.rstrip("/")
        if path == "/api/health":
            _send_json(self, {"ok": True})
            return
        if path.startswith("/api/jobs/"):
            self._job_route(path)
            return
        _send_json(self, {"error": "Not found"}, 404)

    # ── Implementations ───────────────────────────────────────────

    def _start_job(self) -> None:
        with LOCK:
            running = [j for j in JOBS.values() if j["status"] == "running"]
        if running:
            _send_json(self, {"error": "A scrape is already running"}, 409)
            return

        body = _read_json(self)
        query = (body.get("query") or "").strip()
        if len(query) < 3:
            _send_json(self, {"error": "Query must be at least 3 characters"}, 400)
            return

        source = (body.get("source") or "all").strip().lower()
        if source not in ("maps", "google", "bing", "all"):
            source = "all"
        try:
            max_leads = int(body.get("maxLeads", 300))
        except (TypeError, ValueError):
            max_leads = 300
        max_leads = max(10, min(max_leads, 1000))

        skip_emails = body.get("skipEmails") or []
        skip_domains = body.get("skipDomains") or []
        if not isinstance(skip_emails, list):
            skip_emails = []
        if not isinstance(skip_domains, list):
            skip_domains = []
        skip_emails = [str(e).strip().lower() for e in skip_emails if e and "@" in str(e)][:50000]
        skip_domains = [str(d).strip().lower() for d in skip_domains if d][:50000]

        job = _make_job(query, source, max_leads, skip_emails, skip_domains)
        t = threading.Thread(target=_run_job, args=(job,), daemon=True)
        t.start()
        _send_json(self, {"jobId": job["id"]}, 202)

    def _job_route(self, path: str) -> None:
        parts = path.split("/")
        if len(parts) < 4:
            _send_json(self, {"error": "Not found"}, 404)
            return
        job_id = parts[3]
        if job_id == "active":
            with LOCK:
                running_jobs = [j for j in JOBS.values() if j["status"] == "running"]
                job = running_jobs[0] if running_jobs else (list(JOBS.values())[-1] if JOBS else None)
            if not job:
                _send_json(self, {"active": False, "job": None})
                return
            _send_json(self, {"active": job["status"] == "running", "job": _job_summary(job)})
            return

        job = JOBS.get(job_id)
        if not job:
            _send_json(self, {"error": "Job not found"}, 404)
            return

        if len(parts) >= 5 and parts[4] == "csv":
            csv_text = _job_csv(job)
            if not csv_text:
                _send_json(self, {"error": "No leads yet"}, 404)
                return
            safe_query = "".join(c if c.isalnum() or c in " -_" else "_" for c in job["query"])
            filename = f"{safe_query.strip().replace(' ', '_')[:50]}.csv"
            body = csv_text.encode("utf-8-sig")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header(
                "Content-Disposition", f'attachment; filename="{filename}"'
            )
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        _send_json(self, _job_summary(job))


def main() -> None:
    print(f"Email finder service on http://{HOST}:{PORT}  (Ctrl+C to stop)")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping lead scraper service…")
        server.shutdown()


if __name__ == "__main__":
    main()
