-- AlterTable
ALTER TABLE `users` ADD COLUMN `reminder_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reminder_time` CHAR(5) NULL,
    ADD COLUMN `spirit_onboarded` BOOLEAN NOT NULL DEFAULT false;