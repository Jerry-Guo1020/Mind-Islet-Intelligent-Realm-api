-- 情绪岛进度与季节物品。旧 island_assets 保留，首页不再读取。
CREATE TABLE `island_progress` (
    `user_id` VARCHAR(191) NOT NULL,
    `happy_points` INTEGER NOT NULL DEFAULT 0,
    `disappoint_points` INTEGER NOT NULL DEFAULT 0,
    `total_check_ins` INTEGER NOT NULL DEFAULT 0,
    `consecutive_check_in_days` INTEGER NOT NULL DEFAULT 0,
    `last_check_in_date` CHAR(10) NULL,
    `last_mood` ENUM('ecstatic', 'calm', 'tired', 'anxious', 'sad') NULL,
    `season` ENUM('spring', 'summer', 'autumn', 'winter') NOT NULL DEFAULT 'spring',
    `special_reward` VARCHAR(191) NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `island_placements` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `season` ENUM('spring', 'summer', 'autumn', 'winter') NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `island_placements_user_id_season_item_id_key`(`user_id`, `season`, `item_id`),
    INDEX `island_placements_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `island_progress` ADD CONSTRAINT `island_progress_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `island_placements` ADD CONSTRAINT `island_placements_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
