export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export const dashboardCardBase =
  'bg-[#111622]/90 border border-white/10 rounded-2xl transition-all duration-200'

export const dashboardCardHover = 'hover:border-indigo-300/30 hover:bg-[#151a2a]'

export const dashboardCardStatic = `${dashboardCardBase} p-4`

export const dashboardCardInteractive = `${dashboardCardBase} ${dashboardCardHover} p-4`
