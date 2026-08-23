import { InboxClient } from "./inbox-client";

export const metadata = {
  title: "Mailbox Inbox | DEVSYNX Suite",
  description: "View replies and incoming mail across your sending mailboxes.",
};

export default function InboxPage() {
  return <InboxClient />;
}
