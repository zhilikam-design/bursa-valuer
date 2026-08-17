"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Banknote, LineChart, Percent } from "lucide-react";
import { LangProvider, useLang } from "@/lib/i18n";
import { toBursaCode } from "@/lib/bursa";
import { SEED_STOCKS } from "@/lib/data/seed";
import { Button } from "@/components/ui/button";
import { LangToggle } from "@/components/LangToggle";

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="text-primary">{icon}</div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}

function LandingInner() {
  const { t, lang } = useLang();
  const router = useRouter();
  const [q, setQ] = useState("");

  function go(code: string) {
    const c = toBursaCode(code);
    if (c) router.push(`/stock/${c}`);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-bold">{t("app.name")}</div>
              <div className="text-xs text-muted-foreground">
                {t("app.tagline")}
              </div>
            </div>
          </div>
          <LangToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t("app.zhName")}</h1>
        <p className="mt-3 text-muted-foreground">
          {t("app.tagline")} — DCF · {t("model.ddm")} · {t("model.pe")}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
          className="mx-auto mt-8 flex max-w-md gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit">{t("search.button")}</Button>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("search.try")}</span>
          {SEED_STOCKS.slice(0, 6).map((s) => (
            <button
              key={s.code}
              onClick={() => go(s.code)}
              className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              {s.code} · {lang === "zh" ? s.nameZh : s.name}
            </button>
          ))}
        </div>

        <div className="mt-14 grid gap-4 text-left sm:grid-cols-3">
          <FeatureCard
            icon={<LineChart className="h-5 w-5" />}
            title={t("model.dcf.full")}
            desc={t("model.dcf.desc")}
          />
          <FeatureCard
            icon={<Banknote className="h-5 w-5" />}
            title={t("model.ddm.full")}
            desc={t("model.ddm.desc")}
          />
          <FeatureCard
            icon={<Percent className="h-5 w-5" />}
            title={t("model.pe.full")}
            desc={t("model.pe.desc")}
          />
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          {t("disclaimer")}
        </p>
      </main>
    </div>
  );
}

export default function LandingPage() {
  return (
    <LangProvider>
      <LandingInner />
    </LangProvider>
  );
}
