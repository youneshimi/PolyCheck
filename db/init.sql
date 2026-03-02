-- PolyCheck - Initialisation de la base de données
-- Encodage UTF-8

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── Table reviews ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `reviews` (
  `id`           VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  `language`     VARCHAR(50)  NOT NULL,
  `filename`     VARCHAR(255) DEFAULT NULL,
  `code_snippet` MEDIUMTEXT   NOT NULL,
  `code_hash`    VARCHAR(64)  NOT NULL,
  `total_issues` INT          NOT NULL DEFAULT 0,
  `summary`      JSON         DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_language`   (`language`),
  INDEX `idx_code_hash`  (`code_hash`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Table issues ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `issues` (
  `id`          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
  `review_id`   VARCHAR(36)  NOT NULL,
  `category`    ENUM('bug','security','style') NOT NULL,
  `severity`    ENUM('critical','high','medium','low') NOT NULL,
  `line`        INT          DEFAULT NULL,
  `column`      INT          DEFAULT NULL,
  `rule`        VARCHAR(100) DEFAULT NULL,
  `message`     TEXT         NOT NULL,
  `suggestion`  TEXT         DEFAULT NULL,
  `source`      ENUM('groq','ast') NOT NULL DEFAULT 'groq',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_review_id`  (`review_id`),
  INDEX `idx_category`   (`category`),
  INDEX `idx_severity`   (`severity`),
  CONSTRAINT `fk_issues_review`
    FOREIGN KEY (`review_id`) REFERENCES `reviews` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
