.PHONY: check fmt test desktop-check rust-check

check: desktop-check rust-check

desktop-check:
	cd desktop && npx --yes pnpm@10.18.3 check

rust-check:
	cargo fmt --manifest-path local/Cargo.toml --all -- --check
	cargo check --manifest-path local/Cargo.toml --workspace
	cargo test --manifest-path local/Cargo.toml --workspace
	cargo fmt --manifest-path server/standalone/Cargo.toml --all -- --check
	cargo check --manifest-path server/standalone/Cargo.toml --workspace
	cargo test --manifest-path server/standalone/Cargo.toml --workspace

fmt:
	cd desktop && npx --yes pnpm@10.18.3 format
	cargo fmt --manifest-path local/Cargo.toml --all
	cargo fmt --manifest-path server/standalone/Cargo.toml --all

test:
	cargo test --manifest-path local/Cargo.toml --workspace
	cargo test --manifest-path server/standalone/Cargo.toml --workspace
	cd desktop && npx --yes pnpm@10.18.3 test
