CREATE TABLE `share_links` (
	`token` text PRIMARY KEY NOT NULL,
	`map_id` text NOT NULL,
	`permission` text DEFAULT 'view' NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `mind_maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_map_idx` ON `share_links` (`map_id`);
--> statement-breakpoint
CREATE INDEX `share_links_active_idx` ON `share_links` (`active`,`token`);
