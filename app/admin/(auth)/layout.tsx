import { Logo } from "@/components/layout/logo";

// Sign-in steps: the dark header with the logo (Style §11.9), then a narrow, centered form.
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="tone-dark sticky top-0 z-40 border-b border-divider-dark">
        <div className="flex h-15.5 items-center gap-3 px-4 lg:h-22 lg:gap-4 lg:px-8">
          <Logo placement="header" />
          <p className="font-display text-xl font-medium">CWR admin portal</p>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-form px-4 py-12">
        {children}
      </main>
    </>
  );
}
