CREATE TABLE `mind_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '未命名心智圖' NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text
);
