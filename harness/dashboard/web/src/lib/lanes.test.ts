import { describe, expect, it } from 'vitest'
import { column, task } from '@/test/fixtures'
import { dropColumn, laneOwner, lanesOf, nextStep, shownTasks } from './lanes'
import type { ColumnGroup } from './types'

const plan: ColumnGroup = { id: 'plan', title: 'Plan', icon: 'compass', tone: 'warn' }
const dev = { id: 'development', title: 'Development', icon: 'hammer' }
const COLUMNS = [
  column({ id: 'backlog', title: 'Backlog', owner: 'human' }),
  column({ id: 'plan', agent: 'planner', group: plan }),
  column({ id: 'ideation', agent: 'designer', group: plan }),
  column({ id: 'designing', owner: 'human' }),
  column({ id: 'development', agent: 'builder', kinds: ['full'], group: dev }),
  column({ id: 'review', agent: 'builder', kinds: ['full'], group: dev, enter_label: 'Create draft PR' }),
  column({ id: 'done', owner: 'human' }),
]

describe('lanesOf', () => {
  it('joins neighbouring columns that share a group, titled from the group', () => {
    const lanes = lanesOf(COLUMNS)
    expect(lanes.map((l) => l.id)).toEqual(['backlog', 'plan', 'designing', 'development', 'done'])
    expect(lanes[1]).toMatchObject({ title: 'Plan', icon: 'compass', tone: 'warn' })
    expect(lanes[1].columns.map((c) => c.id)).toEqual(['plan', 'ideation'])
  })

  it('keeps a group split by another column as two lanes', () => {
    const cols = [column({ id: 'a', group: plan }), column({ id: 'b' }), column({ id: 'c', group: plan })]
    expect(lanesOf(cols).map((l) => l.columns.length)).toEqual([1, 1, 1])
  })
})

describe('laneOwner', () => {
  it('names one agent, counts several, and says you for human columns', () => {
    const [backlog, planLane, , devLane] = lanesOf(COLUMNS)
    expect(laneOwner(backlog)).toBe('@you')
    expect(laneOwner(planLane)).toBe('2 agents')
    expect(laneOwner(devLane)).toBe('@builder')
  })
})

describe('dropColumn', () => {
  it("sends a dropped card to the lane's first column that takes it", () => {
    const [, planLane, , devLane] = lanesOf(COLUMNS)
    expect(dropColumn(planLane, task({ id: 'a' }))?.id).toBe('plan')
    expect(dropColumn(devLane, task({ id: 'a', kind: 'full' }))?.id).toBe('development')
    expect(dropColumn(devLane, task({ id: 'a', kind: 'design' }))).toBeNull()
  })
})

describe('nextStep', () => {
  it("offers the next column's enter_label on a ready card in the same lane", () => {
    expect(nextStep(task({ id: 'a', column: 'development', status: 'ready' }), COLUMNS)).toMatchObject({ label: 'Create draft PR', column: { id: 'review' } })
  })

  it('offers nothing while working, at the end of a lane, or without a label', () => {
    expect(nextStep(task({ id: 'a', column: 'development', status: 'working' }), COLUMNS)).toBeNull()
    expect(nextStep(task({ id: 'a', column: 'review', status: 'ready' }), COLUMNS)).toBeNull()
    expect(nextStep(task({ id: 'a', column: 'plan', status: 'ready' }), COLUMNS)).toBeNull()
  })
})

describe('shownTasks', () => {
  it("keeps one project's tasks, or all of them", () => {
    const tasks = [task({ id: 'a', profile: 'chomp' }), task({ id: 'b', profile: 'acme' })]
    expect(shownTasks(tasks, 'chomp').map((t) => t.id)).toEqual(['a'])
    expect(shownTasks(tasks, null)).toHaveLength(2)
  })
})
