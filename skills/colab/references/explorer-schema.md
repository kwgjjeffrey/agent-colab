# Colab Explorer (in development)

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

Catalog mutations and sharing destinations remain pending. This interface is not
yet published or end-to-end accepted.
