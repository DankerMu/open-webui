# ocu-chat-image-sync Specification

## Purpose

Images a user attaches to a chat message reach the chat's OCU sandbox, so the agent can open and process them like any other synced file.

## Requirements

### Requirement: The tool wrapper syncs user-attached chat images into the sandbox

Before an OCU tool call, the WebUI tool wrapper SHALL copy into `/mnt/user-data/files/` every image in the chat's messages that the requesting user may read: images WebUI generated (`type` `image`, `url` `/api/v1/files/<id>/content`) and images a user attached (a message file entry whose `content_type` starts with `image/` and whose `id` is a nonempty string). It SHALL read the chat only when the requesting user owns it, and SHALL copy a file only when its stored row's content type is `image/*` and the user owns the row or has read access to it.

#### Scenario: A user-uploaded image is synced

- **WHEN** a user message carries `{type: "file", id: U, url: U, content_type: "image/png"}`, the stored file U is `image/png` and owned by the requesting user, and an OCU tool is called
- **THEN** U is copied into `/mnt/user-data/files/` once, the tool result names it in a `Synced image: /mnt/user-data/files/<name>` line, and a later call does not copy it again

#### Scenario: An image added by URL is synced

- **WHEN** a user message carries `{type: "image", id: U, url: U, content_type: "image/jpeg"}` for a readable stored image
- **THEN** U is copied into `/mnt/user-data/files/`

#### Scenario: A non-image or unreadable entry is not synced

- **WHEN** a message entry claims `content_type: "image/png"` but the stored row is `application/pdf`, or the requesting user neither owns nor may read the stored image
- **THEN** that file is not copied into the sandbox

#### Scenario: A generated image is still synced

- **WHEN** an assistant message carries `{type: "image", url: "/api/v1/files/<id>/content"}` for a readable stored image
- **THEN** it is copied into `/mnt/user-data/files/` as before
