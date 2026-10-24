-- 当天问候只生成一次。过了上海零点，应用层发现 day 对不上再重新写。
CREATE TABLE `ai_greetings` (
    `user_id` VARCHAR(191) NOT NULL,
    `day` CHAR(10) NOT NULL,
    `text` TEXT NOT NULL,
    `mood_type` ENUM('ecstatic', 'calm', 'tired', 'anxious', 'sad') NOT NULL,
    `weather` VARCHAR(16) NOT NULL,
    `checked_in` BOOLEAN NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_greetings` ADD CONSTRAINT `ai_greetings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
