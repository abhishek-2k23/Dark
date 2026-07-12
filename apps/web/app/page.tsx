import Link from "next/link";

const links = [
  { href: "/privacy", title: "Privacy Policy", description: "How Portal handles your data." },
  { href: "/help", title: "Help & Support", description: "Get answers and contact us." },
  {
    href: "/delete-account",
    title: "Delete Account",
    description: "Request deletion of your Portal account.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Portal</h1>
        <p className="text-muted-foreground">Support and legal information.</p>
      </div>
      <ul className="grid gap-4">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <span className="font-medium">{link.title}</span>
              <span className="block text-sm text-muted-foreground">{link.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
