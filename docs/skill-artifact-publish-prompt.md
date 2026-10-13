# Publish a Skill project to My workspace

Give the following instruction to the Agent developing the Skill:

Add a Colab artifact release target to this project while preserving existing GitHub/CDN publishing. Inspect the real Skill root and existing build/tests. Initialize the scaffold (replace project, root and package placeholders):

```sh
~/.agents/skills/kwai-colab/bin/colab-skill-release init --project '<absolute-project>' --skill-dir '<relative-skill-root>' --channel '25e5e621-4af7-4675-af16-bf0b8d10c598' --package '<stable-package-name>'
```

Configure `colab-release.json` with existing buildCommands and validationCommands as argv arrays. Optional artifactFile reuses an existing project-relative ZIP; otherwise only tracked Skill files are packaged. Commit source and scaffold, then run:

```sh
python3 scripts/publish-colab-skill.py --version '<new-version>' --notes '<release-notes>'
```

Check the successful receipt and Channel asset. The publisher downloads and verifies the original ZIP before reporting success. Keep the package identity stable across updates and choose a new version for changed bytes. Do not install into the local Skill directory as a publishing step. Override COLAB_SKILL_RELEASE_TOOL when moving the scaffold to another machine.

Installation acceptance must follow the current Agent configuration, project AGENTS.md and existing installer. Colab publication does not select the consumer installation directory; do not assume `.agents/skills` when the project requires `.codex/skills` or another path.
