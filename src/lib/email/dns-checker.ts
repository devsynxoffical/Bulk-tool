import dns from "dns";

export interface DnsCheckResult {
  domain: string;
  spf: { verified: boolean; record: string | null };
  dkim: { verified: boolean; record: string | null; selectorFound: string | null };
  dmarc: { verified: boolean; record: string | null };
  mx: { verified: boolean; records: string[] };
  isFullyConfigured: boolean;
}

export async function verifyDomainDns(
  domainName: string,
  customSelector: string = "dkim",
): Promise<DnsCheckResult> {
  const domain = domainName.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  let spfRecord: string | null = null;
  let dkimRecord: string | null = null;
  let dkimSelectorFound: string | null = null;
  let dmarcRecord: string | null = null;
  let mxHostList: string[] = [];

  // 1. Resolve TXT records for domain (SPF)
  try {
    const txtRecords = await dns.promises.resolveTxt(domain);
    const flat = txtRecords.map((r) => r.join(""));
    const spf = flat.find((r) => r.includes("v=spf1"));
    if (spf) spfRecord = spf;
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

  // 3. Resolve In-House DKIM record (checks customSelector dkim._domainkey.domain.com)
  const selectors = Array.from(new Set([customSelector, "dkim", "default"]));
  for (const selector of selectors) {
    try {
      const dkimTxt = await dns.promises.resolveTxt(`${selector}._domainkey.${domain}`);
      const flatDkim = dkimTxt.map((r) => r.join(""));
      const dkim = flatDkim.find((r) => r.includes("v=DKIM1") || r.includes("k=rsa") || r.includes("p="));
      if (dkim) {
        dkimRecord = dkim;
        dkimSelectorFound = selector;
        break;
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

  const spfVerified = !!spfRecord;
  const dmarcVerified = !!dmarcRecord;
  const mxVerified = mxHostList.length > 0;
  const dkimVerified = !!dkimRecord;

  return {
    domain,
    spf: { verified: spfVerified, record: spfRecord },
    dkim: { verified: dkimVerified, record: dkimRecord, selectorFound: dkimSelectorFound },
    dmarc: { verified: dmarcVerified, record: dmarcRecord },
    mx: { verified: mxVerified, records: mxHostList },
    isFullyConfigured: spfVerified && dkimVerified && dmarcVerified && mxVerified,
  };
}
