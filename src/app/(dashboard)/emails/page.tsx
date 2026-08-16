import { SentEmailsClient } from "./sent-emails-client";

export const metadata = {
  title: "Sent Email Tracker | DEVSYNX Suite",
  description: "View and manage sent email records, open tracking pixel stats, and deliverability logs.",
};

export default function SentEmailsPage() {
  return <SentEmailsClient />;
}
