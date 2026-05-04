import { useQuery } from "@tanstack/react-query"
import { ActionDTO } from "@/types/dto"

export async function fetchActions(): Promise<ActionDTO[]> {
  const res = await fetch("/api/dashboard/actions")
  if (!res.ok) throw new Error("Failed to fetch")
  return res.json()
}

export function useActions() {
  return useQuery({
    queryKey: ["dashboard-actions"],
    queryFn: fetchActions,
    staleTime: 10000,
  })
}
