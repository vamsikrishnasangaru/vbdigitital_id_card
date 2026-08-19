'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ContactDialog } from '@/components/landing/ContactDialog';

const ContactContext = createContext({ openContact: () => {} });

export function ContactProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openContact = useCallback(() => setOpen(true), []);

  const value = useMemo(() => ({ openContact }), [openContact]);

  return (
    <ContactContext.Provider value={value}>
      {children}
      <ContactDialog open={open} onClose={() => setOpen(false)} />
    </ContactContext.Provider>
  );
}

export function useContact() {
  return useContext(ContactContext);
}
