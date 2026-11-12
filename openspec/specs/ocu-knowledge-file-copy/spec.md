# ocu-knowledge-file-copy Specification

## Purpose

Let the chat model copy a knowledge-base document that the chat's owner may read into the chat's workspace. The sandbox can then process the original file, for example to extract its figures.

## Requirements

### Requirement: Copy one knowledge-base file into the workspace

The Open WebUI tool wrapper SHALL offer a tool `copy_knowledge_file` that takes one WebUI file id and a description.

- For a saved chat, it SHALL copy that file's stored bytes into the chat's workspace files directory (`/mnt/user-data/files/`), named after the file's display name.
- Before any work, it SHALL apply the same chat and configuration checks as the wrapper's other tools.
- After a successful copy, it SHALL emit the wrapper's workspace-changed hint, so that an open Files sidebar refreshes.

A result SHALL never be an exception:

- A successful copy SHALL return `Copied <display name> to /mnt/user-data/files/<stored name>`, where `<stored name>` includes any collision suffix the workspace applied.
- When the workspace stored the file but reported a discovery failure, the result SHALL also carry the wrapper's existing `[DISCOVERY WARNING]` line for that file.
- Any failure SHALL return a result starting with `Error:` that states the reason.

#### Scenario: Readable knowledge-base file copied

- **WHEN** user U owns knowledge base K, file F (named `报告.docx`) is in K, and the model calls `copy_knowledge_file` with F's id in U's saved chat
- **THEN** the workspace contains `报告.docx` with F's bytes, and the result is `Copied 报告.docx to /mnt/user-data/files/报告.docx`

#### Scenario: Name collision

- **WHEN** the workspace already holds an unrelated `报告.docx` and the model copies F
- **THEN** the result names the suffixed stored path that the workspace returned, and the existing `报告.docx` is unchanged

#### Scenario: Discovery failure after storing

- **WHEN** the workspace stores F but reports discovery status `failed`
- **THEN** the result names the stored path and carries the `[DISCOVERY WARNING]` line for it

#### Scenario: Upload failure

- **WHEN** the WebUI storage cannot produce F's bytes, or the workspace upload answers with an HTTP error or cannot be reached
- **THEN** the result starts with `Error:`, no exception reaches Open WebUI, and no receipt is written

#### Scenario: Unsaved chat refused

- **WHEN** the tool is called without a saved chat id
- **THEN** it returns the wrapper's chat-id error and nothing is uploaded

### Requirement: Knowledge-base read access of the chat owner

The tool SHALL copy a file only when the file is linked, through knowledge-base membership, to at least one knowledge base that the **chat's owner** can read. The owner can read a knowledge base when any of these holds:

- the owner owns it;
- a read grant names the owner;
- a read grant names one of the owner's groups;
- a read grant is open to every user (`user:*`).

The decision SHALL depend only on the chat owner, whoever calls the tool. Administrator status SHALL NOT count as access. A legacy `collection_name` field in the file's metadata SHALL NOT count as membership.

Each of these SHALL return a result starting with `Error:` that states the reason, and SHALL upload nothing:

- a file linked to no knowledge base the owner can read;
- an unknown id;
- a file with no stored bytes;
- a chat that cannot be found.

#### Scenario: Group-granted knowledge base

- **WHEN** knowledge base K is granted read to group G, the chat owner U is a member of G, and the model copies file F from K
- **THEN** F is copied

#### Scenario: Directly granted knowledge base

- **WHEN** knowledge base K is granted read to user U, the chat's owner, and the model copies F from K
- **THEN** F is copied

#### Scenario: Knowledge base open to everyone

- **WHEN** knowledge base K holds a `user:*` read grant and the model copies F from K in U's chat
- **THEN** F is copied

#### Scenario: One of several knowledge bases readable

- **WHEN** F is in knowledge base K1, which U cannot read, and in K2, which U owns
- **THEN** F is copied

#### Scenario: Ungranted knowledge base

- **WHEN** F is only in a knowledge base that neither U nor U's groups can read
- **THEN** the result starts with `Error:` and no upload request is made

#### Scenario: Administrator caller in another user's chat

- **WHEN** an administrator who owns knowledge base K triggers the tool in U's chat, and U cannot read K
- **THEN** the result starts with `Error:` and no upload request is made

#### Scenario: Another caller, owner may read

- **WHEN** a caller who cannot read K triggers the tool in U's chat, and U owns K
- **THEN** F is copied into U's chat's workspace

#### Scenario: Administrator owner without a grant

- **WHEN** U is an administrator, owns the chat, and neither owns nor is granted K
- **THEN** the result starts with `Error:` and no upload request is made

#### Scenario: Legacy collection name only

- **WHEN** F's metadata names a knowledge base U can read in `collection_name`, but F is not a member of it
- **THEN** the result starts with `Error:` and no upload request is made

#### Scenario: Own upload outside any knowledge base

- **WHEN** U copies a file that U uploaded to a chat and that is in no knowledge base
- **THEN** the result starts with `Error:` and no upload request is made

#### Scenario: Unknown id or no stored bytes

- **WHEN** the id matches no WebUI file, or the matching file has no stored path
- **THEN** the result starts with `Error:` and no upload request is made

### Requirement: Deduplicated copies that heal after deletion

Within one chat, copying the same WebUI file again SHALL return the path of the existing copy without writing a second file. When that copy is missing from the workspace, or replaced by a directory, a symlink or another non-regular file, a new copy request SHALL store the bytes again and return the new path. Other I/O failures while checking the copy fail the request instead of copying again. A copy the user edited SHALL be kept unchanged.

#### Scenario: Second copy in the same chat

- **WHEN** the model copies F twice in the same chat
- **THEN** both results name the same path and the workspace holds one copy of F

#### Scenario: Copy deleted, then copied again

- **WHEN** the user deletes the workspace copy of F and the model copies F again
- **THEN** the workspace again holds F's bytes and the result names that path

#### Scenario: Edited copy kept

- **WHEN** the workspace copy of F was edited and the model copies F again
- **THEN** the edited content is unchanged and the result names the existing path

### Requirement: Opt-in re-import on the upload endpoint

OCU's receipted upload endpoint SHALL accept a request header `X-OCU-Reimport-Missing`.

- **Absent.** The endpoint SHALL behave exactly as before: a receipted id keeps returning its recorded record, so a deleted attachment is not brought back.
- **Present with any value other than `1`, including an empty value.** The endpoint SHALL return 400 and store nothing.
- **Value `1` without a non-empty `X-OCU-Attachment-Id`.** The endpoint SHALL return 400 and store nothing.
- **Value `1` with an attachment id that has no receipt.** The endpoint SHALL store the upload and record a receipt as a normal receipted upload does.
- **Value `1` with an attachment id that has a receipt.** The endpoint SHALL return the receipted record unchanged when the receipted name opens as a regular file under the chat's workspace, without following symlinks. When the receipted name is missing, the chat's outputs directory is missing, or the name is denied as a non-regular or symlinked entry, it SHALL store the upload again, with collision naming, and rewrite the receipt to the new name, size and MD5. A probe failure other than these SHALL return 500 and store nothing.

The receipt check and the write SHALL happen under the same per-chat lock that guards receipted uploads.

#### Scenario: Header absent keeps current behavior

- **WHEN** a receipted file was deleted and the same id is uploaded again without the header
- **THEN** the response returns the recorded name and no file is written

#### Scenario: First copy with the header

- **WHEN** an id without a receipt is uploaded with `X-OCU-Reimport-Missing: 1`
- **THEN** the file is stored and a receipt for the id is recorded

#### Scenario: Header with a deleted copy

- **WHEN** a receipted file was deleted and the same id is uploaded with `X-OCU-Reimport-Missing: 1`
- **THEN** the file is written again, and the receipt records the new name, size and MD5

#### Scenario: Header with a directory in place of the copy

- **WHEN** a directory now occupies the receipted name and the same id is uploaded with the header
- **THEN** the bytes are stored under a suffixed name, the receipt records that name, and the directory is untouched

#### Scenario: Probe I/O error

- **WHEN** the probe of the receipted name fails with an I/O error other than not-found or the traversal denial, for an upload with the header
- **THEN** the response is 500, no file is written and the receipt is unchanged

#### Scenario: Header with an edited copy

- **WHEN** the receipted file was edited and the same id is uploaded with the header
- **THEN** the response reports the receipted record and the edited file is unchanged

#### Scenario: Invalid header value

- **WHEN** an upload carries `X-OCU-Reimport-Missing: yes`, or an empty `X-OCU-Reimport-Missing`
- **THEN** the response is 400 and no file or receipt is written

#### Scenario: Header without an attachment id

- **WHEN** an upload carries `X-OCU-Reimport-Missing: 1` and no `X-OCU-Attachment-Id`
- **THEN** the response is 400 and no file is written

### Requirement: Model guidance

The tool description SHALL tell the model to:

1. find a knowledge-base file's id with the knowledge tools;
2. copy it with this tool;
3. process it in the sandbox, for example extracting figures with the docx or pdf skill;
4. show each extracted figure to the user as a markdown image with its workspace file link.

OCU's system prompt notes on uploaded files SHALL contain one sentence that starts with ``If a `copy_knowledge_file` tool is available`` and says that the tool brings a knowledge-base document's original file into `/mnt/user-data/files/`.

#### Scenario: Tool description carries the flow

- **WHEN** the wrapper's `copy_knowledge_file` description is read
- **THEN** it names the knowledge tools as the source of the file id, the docx and pdf skills, and showing figures through workspace file links

#### Scenario: Prompt carries the conditional sentence

- **WHEN** `/system-prompt` is rendered for a saved chat
- **THEN** the uploaded-files notes contain exactly one sentence starting with ``If a `copy_knowledge_file` tool is available``
