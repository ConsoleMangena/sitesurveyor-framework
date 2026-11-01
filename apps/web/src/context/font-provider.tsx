import { createContext, useContext, useEffect, useState } from "react";

import { fonts } from "@/config/fonts";
import { getCookie, setCookie } from "@/lib/cookies";

export type Font = (typeof fonts)[number];

const FONT_COOKIE_NAME = "font";
const FONT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

type FontContextType = {
  font: Font;
  setFont: (font: Font) => void;
};

const FontContext = createContext<FontContextType | null>(null);

/**
 * Owns the `font-<name>` class on `<html>`, persisted in a cookie so the
 * pre-render bootstrap in `index.html` can apply it before first paint.
 */
export function FontProvider({ children }: { children: React.ReactNode }) {
  const [font, _setFont] = useState<Font>(() => {
    const savedFont = getCookie(FONT_COOKIE_NAME);
    return fonts.includes(savedFont as Font) ? (savedFont as Font) : fonts[0];
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.forEach((cls) => {
      if (cls.startsWith("font-")) root.classList.remove(cls);
    });
    root.classList.add(`font-${font}`);
  }, [font]);

  const setFont = (newFont: Font) => {
    setCookie(FONT_COOKIE_NAME, newFont, FONT_COOKIE_MAX_AGE);
    _setFont(newFont);
  };

  return (
    <FontContext.Provider value={{ font, setFont }}>
      {children}
    </FontContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFont() {
  const context = useContext(FontContext);
  if (!context) {
    throw new Error("useFont must be used within a FontProvider");
  }
  return context;
}
