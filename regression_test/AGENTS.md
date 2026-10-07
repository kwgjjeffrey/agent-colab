# Project regression tests

Cases belong in the directories registered by regression.config.yaml; execution records belong in its regressionDirectory. Do not copy the Trace runtime or dependencies into this repository.

Each .mjs case exports literal USECASE {name,description} and META. Start from cases/_example.mjs. Rename the copy so it is discoverable. Leave run absent until a real implementation is requested; never add a placeholder runner. Active means the case is relevant, not that it has an implemented or verified script.

For systematic discovery, follow GUI/command entries through their business outcomes, write cases and Module paths as you read, then consolidate the hierarchy. Re-read only unresolved behavior. Describe purpose, preconditions, actions and observable expected results. Distinguish implemented contracts from roadmap proposals.

Use the installed Trace skill's regression_test/cases/SKILL.md to author cases, execution/SKILL.md to implement scripts and record_store/SKILL.md to analyze results. Preview plan before run. Use real isolated fixtures for writes; metadata never creates isolation or authorization. Keep credentials outside tracked files. Do not add arbitrary latency thresholds without a baseline.
