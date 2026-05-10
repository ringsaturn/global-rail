import type { FilterSpecification } from 'maplibre-gl'
import { ALL_RAIL_CLASSES } from '../types/rail-filter'
import type { RailFilterState } from '../types/rail-filter'

type Expr = unknown[]

const NEVER: FilterSpecification = ['==', ['literal', 1], ['literal', 0]] as FilterSpecification

export function buildRailFilterExpr(f: RailFilterState): FilterSpecification | null {
  const parts: Expr[] = []

  const activeClasses = ALL_RAIL_CLASSES.filter(c => f.classes[c])
  if (activeClasses.length === 0) return NEVER
  if (activeClasses.length < ALL_RAIL_CLASSES.length) {
    parts.push(['in', ['get', 'class'], ['literal', activeClasses]])
  }

  const statusConds: Expr[] = []
  if (f.statuses.operational) {
    statusConds.push([
      'all',
      ['!', ['get', 'is_under_construction']],
      ['!', ['get', 'is_abandoned']],
      ['!', ['get', 'is_disused']],
    ])
  }
  if (f.statuses.under_construction) statusConds.push(['get', 'is_under_construction'])
  if (f.statuses.disused) statusConds.push(['get', 'is_disused'])
  if (f.statuses.abandoned) statusConds.push(['get', 'is_abandoned'])

  if (statusConds.length === 0) return NEVER
  if (statusConds.length < 4) {
    parts.push(statusConds.length === 1 ? statusConds[0] : ['any', ...statusConds])
  }

  const usageConds: Expr[] = []
  if (f.usages.passenger) usageConds.push(['get', 'is_passenger'])
  if (f.usages.freight) usageConds.push(['get', 'is_freight'])

  if (usageConds.length === 0) return NEVER
  if (usageConds.length < 2) {
    const neitherSet: Expr = ['all', ['!', ['get', 'is_passenger']], ['!', ['get', 'is_freight']]]
    parts.push(['any', ...usageConds, neitherSet])
  }

  if (parts.length === 0) return null
  return (parts.length === 1 ? parts[0] : ['all', ...parts]) as FilterSpecification
}
