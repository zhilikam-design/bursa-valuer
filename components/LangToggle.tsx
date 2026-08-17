"use client";

import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setLang(lang === "en" ? "zh" : "en")}
      aria-label="Toggle language"
    >
      {lang === "en" ? "中文" : "EN"}
    </Button>
  );
}
