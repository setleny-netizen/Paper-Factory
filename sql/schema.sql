CREATE TABLE players (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  telegram_id     BIGINT UNIQUE NOT NULL,
  name            VARCHAR(100),
  username        VARCHAR(64),
  photo_url       VARCHAR(255),
  session_token   VARCHAR(64) UNIQUE,
  balance         BIGINT DEFAULT 0,
  raw             DECIMAL(14,2) DEFAULT 400000,
  pending         DECIMAL(14,2) DEFAULT 0,
  produced_total  BIGINT DEFAULT 0,
  power_level     TINYINT DEFAULT 0,
  running         TINYINT DEFAULT 1,
  theme           VARCHAR(32) DEFAULT 'dark',
  joined_at       INT,
  last_seen       INT,
  banned          TINYINT DEFAULT 0,
  ban_reason      VARCHAR(255),
  is_admin        TINYINT DEFAULT 0
);

CREATE TABLE machines (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  player_id       INT NOT NULL,
  model           VARCHAR(40) NOT NULL,
  rack_id         INT NULL,
  slot            TINYINT NULL,
  enabled         TINYINT DEFAULT 1,
  purchase_price  BIGINT DEFAULT 0,
  created_at      DATETIME,
  INDEX(player_id), INDEX(rack_id)
);

CREATE TABLE racks (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  player_id       INT NOT NULL,
  slots           TINYINT NOT NULL,
  purchase_price  BIGINT DEFAULT 0,
  created_at      DATETIME,
  INDEX(player_id)
);

CREATE TABLE promos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(32) UNIQUE NOT NULL,
  kind            VARCHAR(16) NOT NULL,
  value           BIGINT DEFAULT 0,
  model           VARCHAR(40),
  max_uses        INT DEFAULT 0,
  used_count      INT DEFAULT 0,
  expires_at      INT NULL,
  active          TINYINT DEFAULT 1,
  created_at      DATETIME
);

CREATE TABLE promo_uses (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  promo_id        INT NOT NULL,
  player_id       INT NOT NULL,
  used_at         DATETIME,
  UNIQUE(promo_id, player_id)
);

CREATE TABLE history (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  player_id       INT NOT NULL,
  amount          BIGINT NOT NULL,
  note            VARCHAR(255),
  created_at      DATETIME,
  INDEX(player_id)
);

CREATE TABLE audit (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  admin_id        INT NOT NULL,
  action          VARCHAR(64),
  details         TEXT,
  created_at      DATETIME
);
