"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import React from "react";
import { Toaster } from "~/components/ui/sonner";

export const GlobalProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
    </NextThemesProvider>
  );
};
