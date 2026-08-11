CREATE TABLE `rate_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expires_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
ALTER TABLE `share_links` ADD `expires_at` text;--> statement-breakpoint
ALTER TABLE `share_links` ADD `revoked_at` text;