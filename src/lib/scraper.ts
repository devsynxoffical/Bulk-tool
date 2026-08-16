import { z } from "zod";

const SCRAPER_URL = process.env.SCRAPER_URL || "http://127.0.0.1:8787";

export const scrapedLeadSchema = z.object({
  Name: z.string(),
  Category: z.string().optional().default(""),
  Phone: z.string().optional().default(""),
  Email: z.string().optional().default(""),
  Website: z.string().optional().default(""),
  Address: z.string().optional().default(""),
  Rating: z.union([z.number(), z.string()]).optional().default(""),
  Reviews: z.union([z.number(), z.string()]).optional().default(""),
  "Price Range": z.string().optional().default(""),
  Hours: z.string().optional().default(""),
  Latitude: z.union([z.number(), z.string()]).optional().default(""),
  Longitude: z.union([z.number(), z.string()]).optional().default(""),
  "Google Maps URL": z.string().optional().default(""),
  "Place ID": z.string().optional().default(""),
});

export type ScrapedLead = z.infer<typeof scrapedLeadSchema>;

export type ScrapeStats = {
  found: number;
  withPhone: number;
  withEmail: number;
};

export type ScrapeJob = {
  id: string;
  query: string;
  status: "running" | "done" | "error";
  error: string | null;
  stats: ScrapeStats;
  leads: ScrapedLead[];
};

async function proxy<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SCRAPER_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `Scraper error (${res.status})`,
    );
  }
  return data as T;
}

export async function checkScraperHealth(): Promise<boolean> {
  try {
    await fetch(`${SCRAPER_URL}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return true;
  } catch {
    return false;
  }
}

export async function startScrape(params: {
  query: string;
  includeEmails: boolean;
  maxLeads: number;
}): Promise<{ jobId: string }> {
  return proxy("/api/scrape", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getScrapeJob(jobId: string): Promise<ScrapeJob> {
  return proxy(`/api/jobs/${jobId}`);
}

export async function getActiveScrapeJob(): Promise<{ active: boolean; job: ScrapeJob | null }> {
  return proxy<{ active: boolean; job: ScrapeJob | null }>("/api/jobs/active");
}

