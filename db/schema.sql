DROP TABLE IF EXISTS `show`;
DROP TABLE IF EXISTS `movie`;
DROP TABLE IF EXISTS `hall`;

CREATE TABLE `movie` (
  `movie_id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `genre` VARCHAR(100) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `synopsis` TEXT,
  `trailer_image_url` VARCHAR(255),
  `trailer_video_url` VARCHAR(255),
  `mpaa_rating` VARCHAR(10),
  INDEX `idx_movie_title` (`title`),
  INDEX `idx_movie_genre` (`genre`),
  INDEX `idx_movie_status` (`status`)
);

-- Minimal hall table so show can reference it
CREATE TABLE `hall` (
  `hall_id` INT AUTO_INCREMENT PRIMARY KEY,
  `hall_name` VARCHAR(50) NOT NULL
);

CREATE TABLE `show` (
  `show_id` INT AUTO_INCREMENT PRIMARY KEY,
  `movie_id` INT NOT NULL,
  `hall_id` INT NOT NULL,
  `show_date` DATE NOT NULL,
  `show_time` TIME NOT NULL,

  CONSTRAINT `fk_show_movie`
    FOREIGN KEY (`movie_id`) REFERENCES `movie`(`movie_id`)
    ON DELETE CASCADE,

  CONSTRAINT `fk_show_hall`
    FOREIGN KEY (`hall_id`) REFERENCES `hall`(`hall_id`)
    ON DELETE RESTRICT,

  CONSTRAINT `uq_show_hall_date_time`
    UNIQUE (`hall_id`, `show_date`, `show_time`),

  INDEX `idx_show_movie` (`movie_id`),
  INDEX `idx_show_date` (`show_date`)
);