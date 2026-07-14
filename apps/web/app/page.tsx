import Link from "next/link";
import { ShieldCheck, FileText, LifeBuoy, Trash2, ArrowRight, type LucideIcon } from "lucide-react";

type LinkCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  danger?: boolean;
};

const cards: LinkCard[] = [
  {
    href: "/privacy",
    title: "Privacy Policy",
    description: "How Prangan collects, uses, and protects your data.",
    icon: ShieldCheck,
  },
  {
    href: "/terms",
    title: "Terms & Conditions",
    description: "The terms governing your use of Prangan.",
    icon: FileText,
  },
  {
    href: "/help",
    title: "Help & Support",
    description: "Answers to common questions and how to contact us.",
    icon: LifeBuoy,
  },
  {
    href: "/delete-account",
    title: "Delete Account",
    description: "Verify with a one-time code and permanently delete your account.",
    icon: Trash2,
    danger: true,
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ShieldCheck className="size-6" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Prangan</h1>
        <p className="text-muted-foreground">Support &amp; legal information for the Prangan app.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ href, title, description, icon: Icon, danger }) => (
          <Link
            key={href}
            href={href}
            className={`group flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:bg-accent ${
              danger ? "hover:border-destructive/50" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`flex size-10 items-center justify-center rounded-lg ${
                  danger
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
                }`}
              >
                <Icon className="size-5" />
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="space-y-1">
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </Link>
        ))}
      </div>

      <footer className="text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Prangan. All rights reserved.
      </footer>
    </main>
  );
}
