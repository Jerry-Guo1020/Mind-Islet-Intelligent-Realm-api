-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(191) NOT NULL,
    `wechat_openid_hash` VARCHAR(191) NULL,
    `nickname` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_login_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_openid_key`(`openid`),
    UNIQUE INDEX `users_wechat_openid_hash_key`(`wechat_openid_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_sessions_token_hash_key`(`token_hash`),
    INDEX `auth_sessions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `check_in_records` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `check_in_date` CHAR(10) NOT NULL,
    `mood_type` ENUM('ecstatic', 'calm', 'tired', 'anxious', 'sad') NOT NULL,
    `content` TEXT NOT NULL,
    `ai_reply` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `check_in_records_user_id_created_at_idx`(`user_id`, `created_at`),
    UNIQUE INDEX `check_in_records_user_id_check_in_date_key`(`user_id`, `check_in_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `island_assets` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `record_id` VARCHAR(191) NOT NULL,
    `asset_type` ENUM('flower', 'grass', 'tree', 'house', 'house_blue') NOT NULL,
    `pos_x` DOUBLE NOT NULL,
    `pos_y` DOUBLE NOT NULL,
    `z_index` INTEGER NOT NULL DEFAULT 0,
    `img_url` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `island_assets_record_id_key`(`record_id`),
    INDEX `island_assets_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `graph_nodes` (
    `id` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `graph_nodes_keyword_key`(`keyword`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_messages` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` ENUM('user', 'assistant') NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_messages_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_CheckInRecordToGraphNode` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_CheckInRecordToGraphNode_AB_unique`(`A`, `B`),
    INDEX `_CheckInRecordToGraphNode_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `check_in_records` ADD CONSTRAINT `check_in_records_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `island_assets` ADD CONSTRAINT `island_assets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `island_assets` ADD CONSTRAINT `island_assets_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `check_in_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_CheckInRecordToGraphNode` ADD CONSTRAINT `_CheckInRecordToGraphNode_A_fkey` FOREIGN KEY (`A`) REFERENCES `check_in_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_CheckInRecordToGraphNode` ADD CONSTRAINT `_CheckInRecordToGraphNode_B_fkey` FOREIGN KEY (`B`) REFERENCES `graph_nodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
