'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  applyAccentHex,
  applyBgHex,
  applySchoolBg,
  applySchoolColor,
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_CUSTOM_BG,
  DEFAULT_SCHOOL_BG,
  DEFAULT_SCHOOL_COLOR,
  persistAccentHex,
  persistBgHex,
  persistSchoolBg,
  persistSchoolColor,
  readStoredAccentHex,
  readStoredBgHex,
  readStoredSchoolBg,
  readStoredSchoolColor,
  type SchoolBgId,
  type SchoolColorId,
} from '@/lib/school-color';

const SchoolColorContext = createContext<{
  color: SchoolColorId;
  background: SchoolBgId;
  accentHex: string;
  bgHex: string;
  setColor: (id: SchoolColorId) => void;
  setBackground: (id: SchoolBgId) => void;
  setAccentHex: (hex: string) => void;
  setBgHex: (hex: string) => void;
}>({
  color: DEFAULT_SCHOOL_COLOR,
  background: DEFAULT_SCHOOL_BG,
  accentHex: DEFAULT_CUSTOM_ACCENT,
  bgHex: DEFAULT_CUSTOM_BG,
  setColor: () => {},
  setBackground: () => {},
  setAccentHex: () => {},
  setBgHex: () => {},
});

export function SchoolColorProvider({ children }: { children: React.ReactNode }) {
  const [color, setColorState] = useState<SchoolColorId>(DEFAULT_SCHOOL_COLOR);
  const [background, setBackgroundState] = useState<SchoolBgId>(DEFAULT_SCHOOL_BG);
  const [accentHex, setAccentHexState] = useState(DEFAULT_CUSTOM_ACCENT);
  const [bgHex, setBgHexState] = useState(DEFAULT_CUSTOM_BG);

  useEffect(() => {
    const storedColor = readStoredSchoolColor();
    const storedBg = readStoredSchoolBg();
    const storedAccent = readStoredAccentHex();
    const storedBgHex = readStoredBgHex();
    setColorState(storedColor);
    setBackgroundState(storedBg);
    setAccentHexState(storedAccent);
    setBgHexState(storedBgHex);
    applySchoolColor(storedColor);
    applySchoolBg(storedBg);
    applyAccentHex(storedAccent);
    applyBgHex(storedBgHex);
  }, []);

  const setColor = useCallback((id: SchoolColorId) => {
    setColorState(id);
    persistSchoolColor(id);
  }, []);

  const setBackground = useCallback((id: SchoolBgId) => {
    setBackgroundState(id);
    persistSchoolBg(id);
  }, []);

  const setAccentHex = useCallback((hex: string) => {
    const next = persistAccentHex(hex);
    if (!next) return;
    setAccentHexState(next);
    setColorState('custom');
  }, []);

  const setBgHex = useCallback((hex: string) => {
    const next = persistBgHex(hex);
    if (!next) return;
    setBgHexState(next);
    setBackgroundState('custom');
  }, []);

  const value = useMemo(
    () => ({ color, background, accentHex, bgHex, setColor, setBackground, setAccentHex, setBgHex }),
    [color, background, accentHex, bgHex, setColor, setBackground, setAccentHex, setBgHex],
  );
  return <SchoolColorContext.Provider value={value}>{children}</SchoolColorContext.Provider>;
}

export function useSchoolColor() {
  return useContext(SchoolColorContext);
}
