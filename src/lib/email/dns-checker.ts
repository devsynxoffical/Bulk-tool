import dns from "dns";

export interface DnsCheckResult {
  domain: string;
  spf: { verified: boolean; record: string | null };
  dkim: { verified: boolean; record: string | null; selectorFound: string | null };
  dmarc: { verified: boolean; record: string | null };
  mx: { verified: boolean; records: string[] };
  isFullyConfigured: boolean;
}

/**
 * Verifies live DNS records for a domain against DKIM selectors (dkim, default, or custom).
 */
export async function verifyDomainDns(
  domainName: string,
  selector: string = "dkim",
  expectedPublicKey?: string | null,
): Promise<DnsCheckResult> {
  const domain = domainName.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  let spfRecord: string | null = null;
  let spfVerified = false;
  let dkimRecord: string | null = null;
  let dkimSelectorFound: string | null = null;
  let dmarcRecord: string | null = null;
  let mxHostList: string[] = [];

  // 1. Resolve TXT records for domain (SPF)
  try {
    const txtRecords = await dns.promises.resolveTxt(domain);
    const flat = txtRecords.map((r) => r.join(""));
    const spf = flat.find((r) => r.includes("v=spf1"));
    if (spf) {
      spfRecord = spf;
      const cleanSpf = spf.toLowerCase();
      // Valid if it contains v=spf1 with a, mx, ip4, or include
      if (cleanSpf.includes("v=spf1")) {
        spfVerified = true;
      }
    }
  } catch {
    // ignore
  }

  // 2. Resolve DMARC record (_dmarc.domain.com)
  try {
    const dmarcTxt = await dns.promises.resolveTxt(`_dmarc.${domain}`);
    const flatDmarc = dmarcTxt.map((r) => r.join(""));
    const dmarc = flatDmarc.find((r) => r.includes("v=DMARC1"));
    if (dmarc) dmarcRecord = dmarc;
  } catch {
    // ignore
  }

  // 3. Resolve DKIM record (checks custom selector, dkim, default cPanel selector)
  const selectorsToTry = Array.from(new Set([selector, "dkim", "default"]));
  for (const sel of selectorsToTry) {
    try {
      const dkimTxt = await dns.promises.resolveTxt(`${sel}._domainkey.${domain}`);
      const flatDkim = dkimTxt.map((r) => r.join(""));
      const dkim = flatDkim.find((r) => r.includes("v=DKIM1") || r.includes("k=rsa") || r.includes("p="));

      if (dkim) {
        if (expectedPublicKey && sel === selector) {
          const cleanExpected = expectedPublicKey.replace(/[\r\n\s]/g, "");
          const cleanFound = dkim.replace(/[\r\n\s]/g, "");
          if (cleanFound.includes(cleanExpected)) {
            dkimRecord = dkim;
            dkimSelectorFound = sel;
            break;
          }
        } else {
          dkimRecord = dkim;
          dkimSelectorFound = sel;
          break;
        }
      }
    } catch {
      // try next selector
    }
  }

  // 4. Resolve MX records
  try {
    const mxRecords = await dns.promises.resolveMx(domain);
    mxHostList = mxRecords.map((m) => m.exchange);
  } catch {
    // ignore
  }

  const dmarcVerified = Boolean(dmarcRecord);
  const dkimVerified = Boolean(dkimRecord);
  const mxVerified = mxHostList.length > 0;

  return {
    domain,
    spf: { verified: spfVerified, record: spfRecord },
    dkim: { verified: dkimVerified, record: dkimRecord, selectorFound: dkimSelectorFound },
    dmarc: { verified: dmarcVerified, record: dmarcRecord },
    mx: { verified: mxVerified, records: mxHostList },
    isFullyConfigured: spfVerified && dkimVerified && dmarcVerified,
  };
}
