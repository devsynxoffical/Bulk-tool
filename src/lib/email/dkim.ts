import crypto from "crypto";

export interface GeneratedDkimKeyPair {
  privateKey: string;
  publicKey: string;
  dnsTxtRecordName: string;
  dnsTxtRecordValue: string;
  selector: string;
}

/**
 * Generates a 2048-bit RSA DKIM Key Pair and constructs standard DNS TXT record values
 * for domain authentication (identical to Resend, Instantly, and Mailgun).
 */
export function generateDkimKeyPair(
  domainName: string,
  selector: string = "dkim",
): GeneratedDkimKeyPair {
  const cleanDomain = domainName.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  // Extract base64 clean body of public key for DNS TXT record
  const cleanBase64Key = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/[\r\n]/g, "")
    .trim();

  const dnsTxtRecordName = `${selector}._domainkey.${cleanDomain}`;
  const dnsTxtRecordValue = `v=DKIM1; k=rsa; p=${cleanBase64Key}`;

  return {
    privateKey,
    publicKey: cleanBase64Key,
    dnsTxtRecordName,
    dnsTxtRecordValue,
    selector,
  };
}
