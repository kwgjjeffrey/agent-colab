ALTER TABLE canvas_folders ADD COLUMN catalog_position bigint NOT NULL DEFAULT 0;
ALTER TABLE canvases ADD COLUMN catalog_position bigint NOT NULL DEFAULT 0;
ALTER TABLE channel_shares ADD COLUMN catalog_position bigint NOT NULL DEFAULT 0;
