# Skill artifact publication

Two source adapters coexist. `shadow-git-v1` keeps publishing changes from the owner's watched Skill directory. `skill-release-v1` stores explicitly published immutable ZIP artifacts; no local source, watcher or owner-online dependency is registered. Both own a canonical Skill asset and ordinary stable Channel references, with the existing preview, install/update and feedback paths.

The first publication requires an existing Channel. The developer retains a stable package identity; Core registers it under the authenticated owner and Channel. A delegated developer supplies the existing reference after the owner grants publishing rights. Publishing rights do not grant Channel membership or feedback-evidence access.

`colab-skill-release publish --channel <name-or-id> --package <identity> --version <version> --artifact <absolute-zip>` calls Core. Core validates one Skill root, bounded expansion, paths and file modes, reads metadata and produces a complete Git projection. Server stores the original ZIP and projection as opaque blobs and commits the immutable version record and current asset head together. Channel asset IDs, comments and installation receipts remain stable across versions. Server denies legacy revision writes for release assets.

Versions retain their original archive, digest, source commit, publisher, notes and timestamp. Equal-version/equal-byte retries reuse the release; changed bytes require a new version. Concurrent writes use the existing owner quota lock followed by asset locking and a head comparison. Publishers can list the most recent 100 releases, download an exact archive, or promote an existing version for rollback. Core consumption follows the current asset head, rather than the most recently uploaded revision. Release archives remain retained when their last Channel reference is withdrawn; reads still require an authorized active reference and storage remains quota-limited.

Limits: 25 MiB ZIP, 100 MiB expanded bytes, 5,000 entries, 32 MiB projection and the existing 2 GiB owner storage budget. Arbitrary ZIP symlinks, traversal, Git metadata, duplicate and non-portable paths are rejected. This is a Skill ZIP distribution path, not an arbitrary application installer.

For this repository's canonical Skill build, `packaging/publish-skill-to-colab.py` is the release-scaffold target. It verifies `installed.json` version/provenance and calls the thin Skill publisher, which downloads the durable original archive through Core and checks the full SHA-256 before reporting success. Existing R2 desktop distribution remains independent.

```sh
packaging/build-local-artifacts.sh --component colab-skill
python3 packaging/publish-skill-to-colab.py --channel '<Channel>' \
  --artifact '/absolute/path/colab-skill/<version>.zip' --version '<version>' \
  --receipt '/absolute/path/publication.json'
```

GUI Skill preview exposes the current release version and expandable recent version history. Installing, updating and reading feedback continues through the existing interfaces. Native Agent installation changes require a new Agent session to load the new version.
