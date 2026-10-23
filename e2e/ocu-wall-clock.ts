// Waits until the wall clock, which the server judges signed expiry on, has passed a deadline.
// Timers fire on the monotonic clock, so a backward wall-clock step during the wait leaves
// now() at or before the deadline when the first timer fires; re-arm for the remaining gap.
// Imports nothing so the unit test needs no OCU_E2E_CONTEXT.

type WallClockWait = {
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	marginMs: number;
	// Budget for re-arm sleeps after the first, summed from the requested durations.
	capMs: number;
};

export async function waitPastWallClock(
	deadlineMs: number,
	{ now, sleep, marginMs, capMs }: WallClockWait
) {
	if (now() > deadlineMs) return;
	await sleep(deadlineMs - now() + marginMs);
	let spent = 0;
	while (now() <= deadlineMs) {
		const next = deadlineMs - now() + marginMs;
		if (spent + next > capMs)
			throw new Error(
				`wall-clock regression: the wall clock did not pass deadline ${deadlineMs} within ${capMs} ms of extra waiting`
			);
		await sleep(next);
		spent += next;
	}
}
