-- Human-readable names are the stable same-layer selector for a Quick Share. Rejecting
-- case-insensitive duplicates also prevents two received items from materializing into the same
-- local directory on case-insensitive filesystems.
create unique index quick_transfer_item_name_unique
    on quick_transfer_items (transfer_id, lower(name));
