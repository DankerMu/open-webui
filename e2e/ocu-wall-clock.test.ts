import { describe, expect, it } from 'vitest';
import { waitPastWallClock } from './ocu-wall-clock';

const MARGIN = 150;
const CAP = 2000;

// A wall clock whose sleep advances it by the slept duration plus the next scripted step, the
// way a monotonic timer fires on time while the wall clock is stepped underneath it.
function fakeClock(start: number, steps: number[] = [], advances = true) {
	let clock = start;
	const sleeps: number[] = [];
	return {
		sleeps,
		now: () => clock,
		sleep: async (ms: number) => {
			sleeps.push(ms);
			clock += (advances ? ms : 0) + (steps.shift() ?? 0);
		}
	};
}

function wait(deadline: number, clock: ReturnType<typeof fakeClock>) {
	return waitPastWallClock(deadline, {
		now: clock.now,
		sleep: clock.sleep,
		marginMs: MARGIN,
		capMs: CAP
	});
}

describe('waitPastWallClock', () => {
	it('re-arms for the remaining wall-clock gap after a backward step', async () => {
		const clock = fakeClock(0, [-200]);
		await wait(1000, clock);
		expect(clock.sleeps).toEqual([1150, 200]);
		expect(clock.now()).toBeGreaterThan(1000);
	});

	it('sleeps once past the deadline on a steady clock', async () => {
		const clock = fakeClock(0);
		await wait(1000, clock);
		expect(clock.sleeps).toEqual([1150]);
		expect(clock.now()).toBe(1150);
	});

	it('tolerates a backward step one below the cap', async () => {
		const clock = fakeClock(0, [-(CAP - 1)]);
		await wait(1000, clock);
		expect(clock.sleeps).toEqual([1150, CAP - 1]);
		expect(clock.now()).toBeGreaterThan(1000);
	});

	it('fails without a further sleep on a backward step one above the cap', async () => {
		const clock = fakeClock(0, [-(CAP + 1)]);
		await expect(wait(1000, clock)).rejects.toThrow(
			'wall-clock regression: the wall clock did not pass deadline 1000 within 2000 ms of extra waiting'
		);
		expect(clock.sleeps).toEqual([1150]);
	});

	it('spends the cap on re-arms against a frozen clock, then fails', async () => {
		const clock = fakeClock(900, [], false);
		await expect(wait(1000, clock)).rejects.toThrow(/wall-clock regression.*deadline 1000/);
		expect(clock.sleeps).toEqual(Array(9).fill(250));
	});

	it('returns after a forward jump past the deadline and the cap', async () => {
		const clock = fakeClock(0, [CAP + 5000]);
		await wait(1000, clock);
		expect(clock.sleeps).toEqual([1150]);
	});

	it('returns without sleeping when the deadline already passed', async () => {
		const clock = fakeClock(1001);
		await wait(1000, clock);
		expect(clock.sleeps).toEqual([]);
	});
});
