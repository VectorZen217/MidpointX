---
name: google-drive-organizer
description: Manages, organizes, structures, and modifies files and folders within a user's Google Drive with core logical framework for identifying files, creating folder structures, and moving files systematically.
category: domain
---

# Skill: Google Drive Organizer

## Description

This skill enables an AI agent to manage, organize, structure, and modify files and folders within a user's Google Drive. It provides the core logical framework for identifying files, creating folder structures, and moving files systematically.

## Core Capabilities

1. **Directory Discovery**: Analyze existing files and folder structures to prevent duplicates.  
2. **Folder Creation**: Establish new directories with correct hierarchical parent-child relationships.  
3. **File Migration**: Move single or multiple files into designated target folders.  
4. **Fuzzy Search & Match**: Locate files and folders using name-based queries or metadata.

## Tool Definitions

The agent must have access to the following tools (or API endpoints wrapped by these schemas) to execute this skill:

### 1. list_drive_contents

* **Purpose**: Retrieve a list of files and folders in a specific directory.  
* **Parameters**:  
  * folder_id (string, optional): The ID of the folder to query. Defaults to 'root'.  
  * include_trashed (boolean, optional): Whether to include files in the trash. Defaults to false.

### 2. search_drive_files

* **Purpose**: Search files or folders by name, type, or parent folder.  
* **Parameters**:  
  * query (string, required): The search string (e.g., name contains 'Invoice').  
  * mime_type (string, optional): Filter by file type (e.g., application/vnd.google-apps.folder for folders).

### 3. create_drive_folder

* **Purpose**: Create a new folder.  
* **Parameters**:  
  * folder_name (string, required): The name of the new folder.  
  * parent_folder_id (string, optional): The ID of the parent folder. Defaults to 'root'.

### 4. move_drive_file

* **Purpose**: Move a file or folder to a new location.  
* **Parameters**:  
  * file_id (string, required): The ID of the file to move.  
  * target_folder_id (string, required): The ID of the destination folder.  
  * current_parent_id (string, optional): The ID of the current parent folder to remove the file from.

## Execution Protocol & Rules

When asked to organize files, you must follow this strict sequence to prevent data loss or duplicate folders:

### Step 1: Scan and Verify

* **Do not assume paths exist**. Always search for the target folder name using search_drive_files before creating a new one.  
* If a folder with the exact name already exists in the destination parent folder, retrieve its ID instead of generating a duplicate.

### Step 2: Create Missing Nodes

* If the required folder structure does not exist, build it from the top down.  
* Always save the returned IDs of newly created folders to use as parent IDs for nested folders or files.

### Step 3: Relocate Files Safely

* When moving a file, you must add the new target_folder_id and remove the file from its previous parent folder to avoid creating multiple pointer links to the same file.

## Example Agent Workflows

### Scenario A: Create a nested structure and move a file

*User: "Create a folder called 'Q3 Reports' inside my 'Finance' folder, then move 'sales_draft.xlsx' into it."*

1. **Search for 'Finance'**:  
   * Call search_drive_files(query="name = 'Finance' and mimeType = 'application/vnd.google-apps.folder'").  
   * *Result*: Found ID folder_finance_123.  
2. **Verify 'Q3 Reports' inside 'Finance'**:  
   * Call search_drive_files(query="name = 'Q3 Reports' and 'folder_finance_123' in parents").  
   * *Result*: No folder found.  
3. **Create 'Q3 Reports'**:  
   * Call create_drive_folder(folder_name="Q3 Reports", parent_folder_id="folder_finance_123").  
   * *Result*: Created with ID folder_q3_999.  
4. **Find 'sales_draft.xlsx'**:  
   * Call search_drive_files(query="name = 'sales_draft.xlsx'").  
   * *Result*: Found ID file_xlsx_456 with current parent folder_root_000.  
5. **Move the file**:  
   * Call move_drive_file(file_id="file_xlsx_456", target_folder_id="folder_q3_999", current_parent_id="folder_root_000").

## Error Handling Guidelines

* **Permissions issues**: If a write command fails with a permissions error, report the specific file or folder ID that blocked the operation and ask the user to verify their Drive permissions.  
* **Rate Limits**: If Google Drive returns a rate limit error (HTTP 403 / 429), pause execution, implement exponential backoff, and retry.
