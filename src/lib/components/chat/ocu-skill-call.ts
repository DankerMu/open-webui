import { decode } from 'html-entities';
import { writable, type Readable } from 'svelte/store';
import { workspaceFilesEnabled } from '$lib/apis/ocu';
import { getUserSkills, type OcuUserSkill } from '$lib/apis/ocu/skills';

// The OCU wrapper's `view` tool reading an uploaded skill's mount (skill_manager.py), with the
// skill name in the upload-name grammar. Built-in skills live under /mnt/skills/public/.
const UPLOADED_SKILL_MD = /^\/mnt\/skills\/user\/([a-z0-9][a-z0-9-]{0,63})\/SKILL\.md$/;

/**
 * The uploaded skill whose SKILL.md a tool call reads, or null. Reads the raw `arguments`
 * attribute: raw JSON on the structured path, and entity-encoded JSON inside a JSON string in
 * legacy <details> content. The row's own decoded `args` stay empty while it is closed. Never throws.
 */
export function uploadedSkillName(
	toolName: string | undefined,
	encodedArguments: string | undefined
): string | null {
	if (toolName !== 'view') return null;
	let args: unknown = decode(encodedArguments ?? '');
	while (typeof args === 'string') {
		try {
			args = JSON.parse(args);
		} catch {
			// Not JSON (yet): a call still streaming its arguments, or a malformed one, is no match.
			return null;
		}
	}
	const path =
		typeof args === 'object' && args !== null ? (args as Record<string, unknown>).path : null;
	return typeof path === 'string' ? (UPLOADED_SKILL_MD.exec(path)?.[1] ?? null) : null;
}

// Page-scoped: every readable skill (disabled ones included) to its display name.
const displayNames = writable<Map<string, string | null>>(new Map());
export const ocuSkillDisplayNames: Readable<Map<string, string | null>> = {
	subscribe: displayNames.subscribe
};
let loadAttempted = false;

/** The name a user sees: the display name when one is known, else the English name. */
export const shownSkillName = (names: Map<string, string | null>, name: string): string =>
	names.get(name) ?? name;

/** Replaces the map with a fresh GET / result; returns it, so it chains into the menu's list. */
export function rememberOcuSkills(skills: OcuUserSkill[]): OcuUserSkill[] {
	loadAttempted = true;
	displayNames.set(new Map(skills.map((skill) => [skill.name, skill.display_name])));
	return skills;
}

/**
 * Loads the list at most once per page for the tool-call rows, and only with the workspace on.
 * A failure keeps the English names: the label is cosmetic, so it warns once and never retries.
 */
export function loadOcuSkillDisplayNames(config: unknown): void {
	if (loadAttempted || !workspaceFilesEnabled(config)) return;
	loadAttempted = true;
	getUserSkills(localStorage.token).then(rememberOcuSkills, (error: unknown) =>
		console.warn('Uploaded skill display names could not be loaded', error)
	);
}
