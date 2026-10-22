import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { store } from '@/lib/store'
import type { QuestionSet } from '@/lib/types'
import { Questions } from './questions'

const api = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api }))

const SET: QuestionSet = {
  id: 'set1',
  questions: [
    { id: 'q1', question: 'Which page?', options: ['License', 'Vault'], recommended: 'Vault' },
    { id: 'q2', question: 'Any notes?', options: [] },
  ],
}

describe('Questions', () => {
  it('steps through the set and sends every answer together', async () => {
    vi.spyOn(store, 'refresh').mockResolvedValue()
    api.mockResolvedValueOnce({ task: { id: 't' }, chat: [], docs: [], openQuestions: null })
    render(<Questions taskId="t" set={SET} />)

    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Vault · recommended' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'License' }))
    expect(await screen.findByText('Question 2 of 2')).toBeInTheDocument() // a pick moves on by itself

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('radio', { name: 'License' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))

    await userEvent.type(screen.getByPlaceholderText('Your answer'), 'Keep the header')
    await userEvent.click(screen.getByRole('button', { name: 'Send answers' }))
    expect(api).toHaveBeenCalledWith('/api/tasks/t/chat', { answers: { q1: 'License', q2: 'Keep the header' } })
  })

  it('"Use your judgment" sends that question blank and moves on', async () => {
    api.mockReset()
    api.mockResolvedValueOnce({ task: { id: 't' }, chat: [], docs: [], openQuestions: null })
    render(<Questions taskId="t" set={SET} />)
    await userEvent.click(screen.getByRole('button', { name: 'Use your judgment' }))
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use your judgment' }))
    expect(api).toHaveBeenCalledWith('/api/tasks/t/chat', { answers: { q1: '', q2: '' } })
  })
})
