import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TuningSelector } from './TuningSelector'
import { DEFAULT_TUNING_BY_INSTRUMENT, TUNINGS, type Tuning } from '../audio/tunings'

const guitarTunings = TUNINGS.filter((t) => t.instrument === 'guitar')
const byId = (id: string) => TUNINGS.find((t) => t.id === id)!

function Harness({
	initial = DEFAULT_TUNING_BY_INSTRUMENT.guitar,
	onChange,
}: {
	initial?: Tuning
	onChange?: (tuning: Tuning) => void
}) {
	const [value, setValue] = useState(initial)
	return (
		<>
			<button type="button">before</button>
			<TuningSelector
				instrument="guitar"
				value={value}
				onChange={(tuning) => {
					setValue(tuning)
					onChange?.(tuning)
				}}
			/>
			<button type="button">after</button>
		</>
	)
}

const trigger = () => screen.getByRole('button', { name: /e standard/i, expanded: false })
const option = (name: RegExp) => screen.getByRole('option', { name })

describe('TuningSelector', () => {
	it('links the trigger to the listbox and groups options by category', async () => {
		const user = userEvent.setup()
		render(<Harness />)
		const button = trigger()
		expect(button).toHaveAttribute('aria-haspopup', 'listbox')
		expect(button).not.toHaveAttribute('aria-controls')

		await user.click(button)
		const listbox = screen.getByRole('listbox', { name: 'Tunings' })
		expect(button).toHaveAttribute('aria-expanded', 'true')
		expect(button).toHaveAttribute('aria-controls', listbox.id)

		const groups = within(listbox).getAllByRole('group')
		expect(groups.map((g) => g.getAttribute('aria-labelledby'))).toHaveLength(3)
		expect(within(listbox).getByRole('group', { name: 'Drop' })).toBeInTheDocument()
		expect(within(listbox).getAllByRole('option')).toHaveLength(guitarTunings.length)
	})

	it('moves focus to the selected option when opened, with a roving tabIndex', async () => {
		const user = userEvent.setup()
		render(<Harness initial={byId('drop-d')} />)
		await user.click(screen.getByRole('button', { name: /drop d/i }))
		const selected = option(/drop d/i)
		expect(selected).toHaveFocus()
		expect(selected).toHaveAttribute('aria-selected', 'true')
		expect(selected).toHaveAttribute('tabindex', '0')
		const others = screen.getAllByRole('option').filter((o) => o !== selected)
		expect(others.every((o) => o.getAttribute('tabindex') === '-1')).toBe(true)
	})

	it('navigates with arrows (wrapping), Home and End', async () => {
		const user = userEvent.setup()
		render(<Harness />)
		await user.click(trigger())
		const options = screen.getAllByRole('option')
		expect(options[0]).toHaveFocus()

		await user.keyboard('{ArrowDown}')
		expect(options[1]).toHaveFocus()
		await user.keyboard('{ArrowUp}{ArrowUp}')
		expect(options[options.length - 1]).toHaveFocus()
		await user.keyboard('{ArrowDown}')
		expect(options[0]).toHaveFocus()
		await user.keyboard('{End}')
		expect(options[options.length - 1]).toHaveFocus()
		await user.keyboard('{Home}')
		expect(options[0]).toHaveFocus()
	})

	it('opens from the trigger with ArrowDown and selects with Enter', async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(<Harness onChange={onChange} />)
		trigger().focus()
		await user.keyboard('{ArrowDown}')
		expect(screen.getByRole('listbox')).toBeInTheDocument()

		await user.keyboard('{ArrowDown}{Enter}')
		expect(onChange).toHaveBeenCalledWith(guitarTunings[1])
		expect(onChange).toHaveBeenCalledTimes(1)
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: new RegExp(guitarTunings[1].name, 'i') })).toHaveFocus()
	})

	it('selects with Space', async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(<Harness onChange={onChange} />)
		trigger().focus()
		await user.keyboard('{ArrowUp}')
		await user.keyboard('{End} ')
		expect(onChange).toHaveBeenCalledWith(guitarTunings[guitarTunings.length - 1])
	})

	it('closes on Escape and returns focus to the trigger', async () => {
		const user = userEvent.setup()
		render(<Harness />)
		await user.click(trigger())
		await user.keyboard('{Escape}')
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
		expect(trigger()).toHaveFocus()
	})

	it('closes on Tab with focus already back on the trigger', async () => {
		const user = userEvent.setup()
		render(<Harness />)
		await user.click(trigger())
		// By the time the browser runs Tab's default action the list must be gone
		// and focus parked on the trigger, so navigation continues from there.
		// (user-event computes the Tab destination from the detached option, so
		// the keydown itself is what we can assert on here.)
		fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
		expect(trigger()).toHaveFocus()
	})

	it('closes on an outside pointerdown', async () => {
		const user = userEvent.setup()
		render(<Harness />)
		await user.click(trigger())
		fireEvent.pointerDown(screen.getByRole('button', { name: 'before' }))
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
	})

	it('picks an option with a click', async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(<Harness onChange={onChange} />)
		await user.click(trigger())
		await user.click(option(/open g/i))
		expect(onChange).toHaveBeenCalledWith(byId('open-g'))
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
	})
})
