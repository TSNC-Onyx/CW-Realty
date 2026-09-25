import Link from "next/link";

// Narrow, centered frame for the sign-in steps.
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main id="main" className="mx-auto min-h-dvh w-full max-w-form px-4 py-12">
      <Link href="/" className="mb-8 inline-flex items-center gap-3 font-bold">
        {/* eslint-disable-next-line @next/next/no-img-element -- plain image under the strict CSP */}
        <img src="/brand/cwr-logo-120.webp" alt="" width={60} height={60} className="size-15 rounded-full" />
        CWR admin portal
      </Link>
      {children}
    </main>
  );
}
