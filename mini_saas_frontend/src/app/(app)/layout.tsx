"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from '@/components/billzo/AppShell'

export default function BillzoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const tenantId = localStorage.getItem("tenantId");
    if (!tenantId) {
      router.push("/login");
    }
  }, [router]);

  const tenantId = typeof window !== 'undefined' ? localStorage.getItem("tenantId") : null;
  
  if (!tenantId) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}