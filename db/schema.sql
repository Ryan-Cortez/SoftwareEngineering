-- Notes --
-- Admin cannot actually delete movies. They can only move them to archived.
-- This is due to the movie -> show relationship. We do not want a long history
-- of show info being deleted because customers must always be able to view
-- their order history.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `recommendation_movie`;
DROP TABLE IF EXISTS `recommendation`;
DROP TABLE IF EXISTS `favorite_movie`;
DROP TABLE IF EXISTS `ticket`;
DROP TABLE IF EXISTS `booking`;
DROP TABLE IF EXISTS `ticket_price`;
DROP TABLE IF EXISTS `booking_fee`;
DROP TABLE IF EXISTS `promotion`;
DROP TABLE IF EXISTS `payment_card`;
DROP TABLE IF EXISTS `address`;
DROP TABLE IF EXISTS `review`;
DROP TABLE IF EXISTS `movie_contributor`;
DROP TABLE IF EXISTS `seat`;
DROP TABLE IF EXISTS `show`;
DROP TABLE IF EXISTS `showroom`;
DROP TABLE IF EXISTS `theatre`;
DROP TABLE IF EXISTS `customer`;
DROP TABLE IF EXISTS `admin`;
DROP TABLE IF EXISTS `user`;
DROP TABLE IF EXISTS `movie`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `movie` (
  `movie_id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `genre` VARCHAR(100) NOT NULL,
  `status` ENUM('NowShowing', 'ComingSoon', 'Archived') NOT NULL,
  `synopsis` TEXT,
  `trailer_image_url` VARCHAR(255),
  `trailer_video_url` VARCHAR(255),
  `mpaa_rating` VARCHAR(10),
  INDEX `idx_movie_title` (`title`),
  INDEX `idx_movie_genre` (`genre`),
  INDEX `idx_movie_status` (`status`)
) ENGINE=InnoDB;

CREATE TABLE `user` (
  `user_id` INT AUTO_INCREMENT PRIMARY KEY,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone_number` VARCHAR(25),
  `password_hash` VARCHAR(255) NOT NULL,
  CONSTRAINT `uq_user_email` UNIQUE (`email`),
  CONSTRAINT `uq_user_phone_number` UNIQUE (`phone_number`)
) ENGINE=InnoDB;

CREATE TABLE `customer` (
  `customer_id` INT PRIMARY KEY,
  `promotion_opt_in` BOOLEAN NOT NULL DEFAULT FALSE,
  `status` ENUM('Active', 'Inactive', 'Suspended') NOT NULL DEFAULT 'Active',
  CONSTRAINT `fk_customer_user`
    FOREIGN KEY (`customer_id`) REFERENCES `user`(`user_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `admin` (
  `admin_id` INT PRIMARY KEY,
  CONSTRAINT `fk_admin_user`
    FOREIGN KEY (`admin_id`) REFERENCES `user`(`user_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `theatre` (
  `theatre_id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `location` VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE `showroom` (
  `showroom_id` INT AUTO_INCREMENT PRIMARY KEY,
  `theatre_id` INT NOT NULL,
  `showroom_name` VARCHAR(50) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT `fk_showroom_theatre`
    FOREIGN KEY (`theatre_id`) REFERENCES `theatre`(`theatre_id`)
    ON DELETE CASCADE, -- deleting a theatre deletes showrooms in the theatre
  CONSTRAINT `uq_showroom_name_per_theatre` UNIQUE (`theatre_id`, `showroom_name`)
) ENGINE=InnoDB;

CREATE TABLE `show` (
  `show_id` INT AUTO_INCREMENT PRIMARY KEY,
  `movie_id` INT NOT NULL,
  `showroom_id` INT NOT NULL,
  `start_time` DATETIME NOT NULL,
  `duration` INT NOT NULL,
  CONSTRAINT `fk_show_movie`
    FOREIGN KEY (`movie_id`) REFERENCES `movie`(`movie_id`)
    ON DELETE RESTRICT, -- cannot delete a movie if shows reference it
  CONSTRAINT `fk_show_showroom`
    FOREIGN KEY (`showroom_id`) REFERENCES `showroom`(`showroom_id`)
    ON DELETE RESTRICT, -- cannot delete a showroom if shows reference it
  CONSTRAINT `chk_show_duration_positive` CHECK (`duration` > 0),
  CONSTRAINT `uq_showroom_start_time` UNIQUE (`showroom_id`, `start_time`),
  INDEX `idx_show_movie` (`movie_id`),
  INDEX `idx_show_start_time` (`start_time`)
) ENGINE=InnoDB;
-- the `status` attributes in movie and `is_active` in showroom table allow for archiving a 
-- movie and decommissioning a showroom without actually deleting it from db

CREATE TABLE `seat` (
  `seat_id` INT AUTO_INCREMENT PRIMARY KEY,
  `showroom_id` INT NOT NULL,
  `row_label` VARCHAR(10) NOT NULL,
  `seat_number` INT NOT NULL,
  CONSTRAINT `fk_seat_showroom`
    FOREIGN KEY (`showroom_id`) REFERENCES `showroom`(`showroom_id`)
    ON DELETE CASCADE, -- deleting a showroom deletes all seats in it
  CONSTRAINT `uq_seat_in_showroom` UNIQUE (`showroom_id`, `row_label`, `seat_number`)
) ENGINE=InnoDB;

CREATE TABLE `movie_contributor` (
  `movie_id` INT NOT NULL,
  `person_name` VARCHAR(150) NOT NULL,
  `role` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`movie_id`, `person_name`, `role`),
  CONSTRAINT `fk_movie_contributor_movie`
    FOREIGN KEY (`movie_id`) REFERENCES `movie`(`movie_id`)
    ON DELETE CASCADE -- deleting a movie deletes all of its movie contributors
) ENGINE=InnoDB;

CREATE TABLE `review` (
  `review_id` INT AUTO_INCREMENT PRIMARY KEY,
  `movie_id` INT NOT NULL,
  `author` VARCHAR(150) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  CONSTRAINT `fk_review_movie`
    FOREIGN KEY (`movie_id`) REFERENCES `movie`(`movie_id`)
    ON DELETE CASCADE,
  INDEX `idx_review_movie` (`movie_id`)
) ENGINE=InnoDB;

CREATE TABLE `address` (
  `address_id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `street` VARCHAR(255) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `state` VARCHAR(100) NOT NULL,
  `zip_code` VARCHAR(20) NOT NULL,
  CONSTRAINT `fk_address_user`
    FOREIGN KEY (`user_id`) REFERENCES `customer`(`customer_id`)
    ON DELETE CASCADE, -- deleting a user deletes their address if they were a customer
  CONSTRAINT `uq_address_user` UNIQUE (`user_id`)
) ENGINE=InnoDB;

CREATE TABLE `payment_card` (
  `card_id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `card_number` VARCHAR(25) NOT NULL,
  `expiration_date` VARCHAR(10) NOT NULL,
  `billing_address` VARCHAR(255),
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT `fk_payment_card_customer`
    FOREIGN KEY (`user_id`) REFERENCES `customer`(`customer_id`)
    ON DELETE CASCADE, -- deleting a user deletes their cards if they were a customer
  INDEX `idx_payment_card_user` (`user_id`)
) ENGINE=InnoDB;

CREATE TABLE `promotion` (
  `promotion_id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL,
  `description` TEXT,
  `discount_type` VARCHAR(30) NOT NULL,
  `discount_value` DECIMAL(10,2) NOT NULL,
  `expiration_date` DATETIME NOT NULL,
  CONSTRAINT `uq_promotion_code` UNIQUE (`code`) -- promo codes must be unique
) ENGINE=InnoDB;

CREATE TABLE `booking_fee` (
  `fee_id` INT AUTO_INCREMENT PRIMARY KEY,
  `amount` DECIMAL(10,2) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE `booking` (
  `booking_id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `card_id` INT NOT NULL,
  `show_id` INT NOT NULL,
  `booking_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `promotion_id` INT,
  `fee_id` INT NOT NULL,
  `payment_reference` VARCHAR(100),
  CONSTRAINT `fk_booking_customer`
    FOREIGN KEY (`user_id`) REFERENCES `customer`(`customer_id`)
    ON DELETE RESTRICT,
  CONSTRAINT `fk_booking_card`
    FOREIGN KEY (`card_id`) REFERENCES `payment_card`(`card_id`)
    ON DELETE RESTRICT,
  CONSTRAINT `fk_booking_show`
    FOREIGN KEY (`show_id`) REFERENCES `show`(`show_id`)
    ON DELETE RESTRICT,
  CONSTRAINT `fk_booking_promotion`
    FOREIGN KEY (`promotion_id`) REFERENCES `promotion`(`promotion_id`)
    ON DELETE SET NULL,
  CONSTRAINT `fk_booking_fee`
    FOREIGN KEY (`fee_id`) REFERENCES `booking_fee`(`fee_id`)
    ON DELETE RESTRICT,
  INDEX `idx_booking_user` (`user_id`),
  INDEX `idx_booking_show` (`show_id`)
) ENGINE=InnoDB;

CREATE TABLE `ticket_price` (
  `type` ENUM('Adult', 'Senior', 'Child') PRIMARY KEY,
  `price` DECIMAL(10,2) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE `ticket` (
  `ticket_id` INT AUTO_INCREMENT PRIMARY KEY,
  `type` ENUM('Adult', 'Senior', 'Child') NOT NULL,
  `booking_id` INT NOT NULL,
  `seat_id` INT NOT NULL,
  CONSTRAINT `fk_ticket_booking`
    FOREIGN KEY (`booking_id`) REFERENCES `booking`(`booking_id`)
    ON DELETE CASCADE, -- deleting a booking deletes all tickets in the booking
  CONSTRAINT `fk_ticket_seat`
    FOREIGN KEY (`seat_id`) REFERENCES `seat`(`seat_id`)
    ON DELETE RESTRICT,
  CONSTRAINT `fk_ticket_price`
    FOREIGN KEY (`type`) REFERENCES `ticket_price`(`type`)
    ON DELETE RESTRICT,
  INDEX `idx_ticket_booking` (`booking_id`),
  INDEX `idx_ticket_seat` (`seat_id`),
  CONSTRAINT `uq_ticket_booking_seat` UNIQUE (`booking_id`, `seat_id`)
) ENGINE=InnoDB;

CREATE TABLE `favorite_movie` (
  `customer_id` INT NOT NULL,
  `movie_id` INT NOT NULL,
  PRIMARY KEY (`customer_id`, `movie_id`),
  CONSTRAINT `fk_favorite_movie_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customer`(`customer_id`)
    ON DELETE CASCADE, -- deleting a customer deletes their favorite movie list
  CONSTRAINT `fk_favorite_movie_movie`
    FOREIGN KEY (`movie_id`) REFERENCES `movie`(`movie_id`)
    ON DELETE CASCADE -- deleting a movie deletes it from favorite movie lists
) ENGINE=InnoDB;

CREATE TABLE `recommendation` (
  `recommendation_id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `generated_on` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_recommendation_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customer`(`customer_id`)
    ON DELETE CASCADE, -- deleting a customer deletes their recommendations
  INDEX `idx_recommendation_customer` (`customer_id`)
) ENGINE=InnoDB;

CREATE TABLE `recommendation_movie` (
  `recommendation_id` INT NOT NULL,
  `movie_id` INT NOT NULL,
  PRIMARY KEY (`recommendation_id`, `movie_id`),
  CONSTRAINT `fk_recommendation_movie_recommendation`
    FOREIGN KEY (`recommendation_id`) REFERENCES `recommendation`(`recommendation_id`)
    ON DELETE CASCADE, -- deleting a recommendation list deletes all recommendation movies in the list
  CONSTRAINT `fk_recommendation_movie_movie`
    FOREIGN KEY (`movie_id`) REFERENCES `movie`(`movie_id`)
    ON DELETE CASCADE -- deleting a movie deletes it as a recommendation movie
) ENGINE=InnoDB;