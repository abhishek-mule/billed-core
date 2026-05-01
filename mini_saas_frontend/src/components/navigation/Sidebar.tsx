'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  DollarSign, 
  ShoppingCart, 
  Package, 
  Users, 
  CreditCard, 
  BarChart3, 
  Settings,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  X
} from 'lucide-react'
import { NAVIGATION_SECTIONS } from '@/lib/navigation'
import { cn } from '@/lib/utils'

const iconMap: Record<string, any> = {
  LayoutDashboard,
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  MoreHorizontal
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const isSectionActive = (section: any) => {
    return pathname === section.path || pathname.startsWith(section.path + '/')
  }

  const isSubSectionActive = (subSection: any) => {
    return pathname === subSection.path || pathname.startsWith(subSection.path + '/')
  }

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-card border-r border-border transform transition-transform duration-300 ease-in-out",
        "lg:static lg:transform-none",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">B</span>
              </div>
              <span className="font-bold text-lg">BillZo</span>
            </div>
            <button 
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-muted rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {NAVIGATION_SECTIONS.map((section) => {
              const Icon = iconMap[section.icon] || MoreHorizontal
              const isActive = isSectionActive(section)
              const isExpanded = expandedSections.has(section.id)
              const hasSubSections = section.subSections && section.subSections.length > 0

              return (
                <div key={section.id}>
                  {/* Main Section */}
                  <Link
                    href={section.path}
                    onClick={() => {
                      if (hasSubSections) {
                        toggleSection(section.id)
                      }
                      if (window.innerWidth < 1024) {
                        onClose()
                      }
                    }}
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5" />
                      <span>{section.label}</span>
                    </div>
                    {hasSubSections && (
                      <ChevronDown className={cn(
                        "w-4 h-4 transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    )}
                  </Link>

                  {/* Sub-sections */}
                  {hasSubSections && isExpanded && (
                    <div className="mt-1 ml-8 space-y-1">
                      {section.subSections?.map((subSection) => {
                        const isSubActive = isSubSectionActive(subSection)
                        return (
                          <Link
                            key={subSection.id}
                            href={subSection.path}
                            onClick={() => {
                              if (window.innerWidth < 1024) {
                                onClose()
                              }
                            }}
                            className={cn(
                              "block px-3 py-2 rounded-lg text-sm transition-colors",
                              isSubActive
                                ? "bg-primary/20 text-primary font-medium"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {subSection.label}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-primary font-semibold">JD</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">John Doe</p>
                <p className="text-xs text-muted-foreground truncate">john@example.com</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}