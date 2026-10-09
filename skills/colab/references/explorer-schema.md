# Colab Explorer

`colab-explorer` owns mixed-tree discovery. `colab-browser` is legacy and retains
its existing flat references and operations.

`open --ref colab://` discovers Channels. Opening
`colab://channel/<channel>/<catalog...>` lists direct children, not recursive
contents. Segments are individually URL-encoded, including slashes in names.
`--offset` and `--limit` paginate metadata; continuation is `page.nextOffset`.
Discovery never fetches preview bodies.

Opening an asset returns name, kind, updatedAt, readable location `ref`, and a
placement-independent `stableRef`. Pass stableRef to the existing Session Reader,
Files Browser use, Skill Tool, or Canvas tools. Relocation does not change this
consumer identity. Old readable references retain legacy resolver behavior.

`explorerRef` is `colab://resource/<channel-id>/<kind>/<item-id>` and is accepted by
Explorer even after relocation. Catalog stableRef uses this form. Asset stableRef
remains compatible with its legacy consumer, not a new content protocol.

Commands: create-catalog --parent REF --name NAME; rename-catalog --ref REF --name
NAME; remove-catalog --ref REF (empty only); move --ref REF --parent REF; share
--parent REF --item-type files|session|skill --source SOURCE [--name NAME]. They
return short committed receipts. Shared asset movement requires its contributor;
Catalog/Canvas organization follows existing Channel-member editing permissions.

Files share accepts repeated `--exclude` directory names from Browser
`inspect-source` candidates. The list is passed to Core at registration, before
initial publication. Other item types reject Files exclusions. Source configuration
and eventual publication remain Core-owned; Explorer only coordinates placement.
