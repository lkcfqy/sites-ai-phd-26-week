CREATE TABLE `__new_checkpoints` (
	`user_id` text NOT NULL,
	`week` integer NOT NULL,
	`track` text DEFAULT 'common' NOT NULL,
	`score` integer NOT NULL,
	`best_score` integer NOT NULL,
	`answers` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `week`, `track`)
);
--> statement-breakpoint
INSERT INTO `__new_checkpoints`("user_id", "week", "track", "score", "best_score", "answers", "updated_at") SELECT "user_id", "week", 'common', "score", "best_score", "answers", "updated_at" FROM `checkpoints`;--> statement-breakpoint
DROP TABLE `checkpoints`;--> statement-breakpoint
ALTER TABLE `__new_checkpoints` RENAME TO `checkpoints`;--> statement-breakpoint