# Skills artifacts

Every child directory is an independently packaged Skill. Skill packages must be usable after installation and must not reference this repository checkout.

Installation uses immutable version directories plus stable per-agent links and receipts. Supported targets are adapters; currently planned targets include Codex, Claude Code, and MyFlicker. Install, update, and uninstall must preserve unmanaged user files.

The Colab Skill setup is the installation/update authority for Desktop GUI resources, Local Core, and the Skill itself. GUI settings may invoke setup, but must not contain a second updater implementation. Electron is an optional launcher and is not part of the required local combination.

Setup receipts store `componentVersions` per artifact. The top-level release version identifies a signed channel promotion and must not be reused as every artifact's installed version.
