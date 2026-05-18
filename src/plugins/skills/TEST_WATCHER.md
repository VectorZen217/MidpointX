---
name: TEST_WATCHER
description: A test skill to verify the FS observer trigger.
watchPath: ./test_watch_folder
webhookPath: test-trigger
---
# Test Watcher

This is a test skill. If a file in `./test_watch_folder` is changed, or if `/webhook/test-trigger` is hit, this should activate the Silent Assessment actor.
