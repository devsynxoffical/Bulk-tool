"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ContactActions() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, name }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setMessage(data.error || "Failed to add contact");
      return;
    }
    setPhone("");
    setName("");
    setOpen(false);
    router.refresh();
  }

  async function importCsv(file: File) {
    setLoading(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/contacts/import", { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Import failed");
      return;
    }
    setMessage(`Imported ${data.imported} contacts (${data.skipped} skipped)`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importCsv(f);
        }}
      />
      <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={loading}>
        <Upload className="h-4 w-4" />
        Import CSV
      </Button>
      <Button onClick={() => setOpen((v) => !v)}>
        <UserPlus className="h-4 w-4" />
        Add contact
      </Button>

      {message ? <p className="w-full text-sm text-zinc-600">{message}</p> : null}

      {open ? (
        <Card className="mt-2 w-full">
          <CardHeader>
            <CardTitle>Add contact</CardTitle>
            <CardDescription>
              Add a client&apos;s phone number to message them or include them in
              campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={addContact} className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  placeholder="+923001234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={loading} className="w-full">
                  Save contact
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
