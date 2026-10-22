import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmProvider, useConfirm } from './confirm'

function Asker({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  const confirm = useConfirm()
  return (
    <button onClick={async () => onAnswer(await confirm({ title: 'Delete "Login"?', description: 'It leaves the board.', action: 'Delete task', destructive: true }))}>
      ask
    </button>
  )
}

async function ask() {
  const answers: boolean[] = []
  render(<ConfirmProvider><Asker onAnswer={(yes) => answers.push(yes)} /></ConfirmProvider>)
  await userEvent.click(screen.getByText('ask'))
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('Delete "Login"?It leaves the board.')
  return answers
}

describe('useConfirm', () => {
  it('resolves true on the action button', async () => {
    const answers = await ask()
    await userEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(answers).toEqual([true])
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('resolves false on Cancel and on Escape', async () => {
    const answers = await ask()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByText('ask'))
    await screen.findByRole('alertdialog')
    await userEvent.keyboard('{Escape}')
    expect(answers).toEqual([false, false])
  })
})
