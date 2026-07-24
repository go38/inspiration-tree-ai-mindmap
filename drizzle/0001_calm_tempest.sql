ALTER TABLE `mind_maps` ADD `owner_email` text;--> statement-breakpoint
ALTER TABLE `mind_maps` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `mind_maps` ADD `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
CREATE INDEX `mind_maps_owner_updated_idx` ON `mind_maps` (`owner_email`,`archived_at`,`updated_at`);