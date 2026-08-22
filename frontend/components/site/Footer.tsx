import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Lead-Lag Sentinel — a paper-trading simulation over live Polymarket
          microstructure. No real capital at risk.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:text-foreground">
            The Desk
          </Link>
          <Link href="/method" className="hover:text-foreground">
            How it works
          </Link>
        </div>
      </div>
    </footer>
  );
}
