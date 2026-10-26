import { writable } from 'svelte/store';

export type ChatParams = Record<string, unknown>;

// Published only by ChatControls.svelte: its bound chat params, the ids of the models a message
// would go to, and a setter that flows back to Chat.svelte through the existing bind:params.
// One publication carries all three so a reader never pairs one chat's params with another's models.
export type ChatEffortBinding = {
	modelIds: string[];
	params: ChatParams;
	setParams: (next: ChatParams) => void;
};

export const chatEffortParams = writable<ChatEffortBinding | null>(null);
