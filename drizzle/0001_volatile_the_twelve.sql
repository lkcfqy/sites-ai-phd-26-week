CREATE TABLE `checkpoints` (
	`user_id` text NOT NULL,
	`week` integer NOT NULL,
	`score` integer NOT NULL,
	`best_score` integer NOT NULL,
	`answers` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `week`)
);
