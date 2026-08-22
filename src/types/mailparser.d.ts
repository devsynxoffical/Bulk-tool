declare module "mailparser" {
  export function simpleParser(source: Buffer | string): Promise<{
    subject?: string;
    text?: string;
    html?: string;
  }>;
}
