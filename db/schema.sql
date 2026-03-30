/*
HOW TO USE THE DATABASE

- Do not rely on hard deletions to be available for most tables. For example, when I movie is no longer being shown, we do not actually want to delete it from the
  database. This is why I have included 'ARCHIVED' as an ENUM option in the movie table. Why don't we want to delete movies? Because other tables reference the
  movies in the movie table. If the theatre is showing "The Godfather" for a month, there is show data that will reference it and there are bookings that will reference
  it. If we were to delete "The Godfather" from the database when it is done being shown, we will also have historical show data and booking data that would have a null
  reference to a movie. We don't want to erase historical data like that. Whenever we don't want a movie to be shown on the site anymore, change its `status` to
  'ARCHIVED'. Whenever pulling movies to display on the site, make sure their status is not 'ARCHIVED'. This same logic holds for deleting users. We don't want to delete
  users because then we will lose historical data involving bookings, payment cards, addresses, and anything else directly related to a user. There are 'Inactive' and 
  'Suspended' options in the user table to delete a user without actually deleting anything.

*/

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
DROP TABLE IF EXISTS `customer`;
DROP TABLE IF EXISTS `admin`;
DROP TABLE IF EXISTS `user`;
DROP TABLE IF EXISTS `movie`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `movie` (
  `movie_id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `genre` VARCHAR(100) NOT NULL,
  `status` ENUM('CURRENTLY_RUNNING', 'COMING_SOON', 'ARCHIVED') NOT NULL,
  `runtime` INT NOT NULL,
  `synopsis` TEXT,
  `trailer_image_url` VARCHAR(255),
  `trailer_video_url` VARCHAR(255),
  `mpaa_rating` VARCHAR(10),
  INDEX `idx_movie_title` (`title`),
  INDEX `idx_movie_genre` (`genre`),
  INDEX `idx_movie_status` (`status`),
  CONSTRAINT `chk_runtime_positive` CHECK (`runtime` > 0) -- movie runtime must be positive
) ENGINE=InnoDB;

CREATE TABLE `user` (
  `user_id` INT AUTO_INCREMENT PRIMARY KEY,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone_number` VARCHAR(25),
  `password_hash` VARCHAR(255) NOT NULL,
  `is_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `status` ENUM('Active', 'Inactive', 'Suspended') NOT NULL DEFAULT 'Active',
  CONSTRAINT `uq_user_email` UNIQUE (`email`), -- email addresses must be unique
  CONSTRAINT `uq_user_phone_number` UNIQUE (`phone_number`) -- phone numbers must be unique
) ENGINE=InnoDB;

CREATE TABLE `customer` (
  `customer_id` INT PRIMARY KEY,
  `promotion_opt_in` BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT `fk_customer_user`
    FOREIGN KEY (`customer_id`) REFERENCES `user`(`user_id`)
    ON DELETE CASCADE -- if a user is deleted, and that user was a customer, their customer account is deleted
) ENGINE=InnoDB;

CREATE TABLE `admin` (
  `admin_id` INT PRIMARY KEY,
  CONSTRAINT `fk_admin_user`
    FOREIGN KEY (`admin_id`) REFERENCES `user`(`user_id`)
    ON DELETE CASCADE -- if a user is deleted, and that user was an admin, their admin account is deleted
) ENGINE=InnoDB;

CREATE TABLE `showroom` (
  `showroom_id` INT AUTO_INCREMENT PRIMARY KEY,
  `showroom_name` VARCHAR(50) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE `show` (
  `show_id` INT AUTO_INCREMENT PRIMARY KEY,
  `movie_id` INT NOT NULL,
  `showroom_id` INT NOT NULL,
  `start_time` DATETIME NOT NULL,
  CONSTRAINT `fk_show_movie`
    FOREIGN KEY (`movie_id`) REFERENCES `movie`(`movie_id`)
    ON DELETE RESTRICT, -- cannot delete a movie if a show references it
  CONSTRAINT `fk_show_showroom`
    FOREIGN KEY (`showroom_id`) REFERENCES `showroom`(`showroom_id`)
    ON DELETE RESTRICT, -- cannot delete a showroom if a show references it
  CONSTRAINT `uq_showroom_start_time` UNIQUE (`showroom_id`, `start_time`), -- there can only be one show starting in a specific showroom at a time
  INDEX `idx_show_movie` (`movie_id`),
  INDEX `idx_show_start_time` (`start_time`),
  CONSTRAINT `uq_show_showroom` UNIQUE (`show_id`, `showroom_id`) -- a specific show can only be in one showroom
) ENGINE=InnoDB;

CREATE TABLE `seat` (
  `seat_id` INT AUTO_INCREMENT PRIMARY KEY,
  `showroom_id` INT NOT NULL,
  `row_label` VARCHAR(10) NOT NULL,
  `seat_number` INT NOT NULL,
  CONSTRAINT `fk_seat_showroom`
    FOREIGN KEY (`showroom_id`) REFERENCES `showroom`(`showroom_id`)
    ON DELETE RESTRICT, 
  CONSTRAINT `uq_seat_in_showroom` UNIQUE (`showroom_id`, `row_label`, `seat_number`), -- each showroom can only have one seat with a specific row label and seat number (no duplicates)
  CONSTRAINT `uq_seat_showroom_pair` UNIQUE (`seat_id`, `showroom_id`) -- each seat can only exist in one showroom
) ENGINE=InnoDB;

CREATE TABLE `movie_contributor` (
  `movie_id` INT NOT NULL,
  `person_name` VARCHAR(150) NOT NULL,
  `role` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`movie_id`, `person_name`, `role`),
  CONSTRAINT `fk_movie_contributor_movie`
    FOREIGN KEY (`movie_id`) REFERENCES `movie`(`movie_id`)
    ON DELETE CASCADE -- deleting a movie deletes all of its movie contributors
) ENGINE=InnoDB; -- a person CAN have multiple roles in the same movie (e.g. someone is an actor AND a producer)

CREATE TABLE `review` (
  `review_id` INT AUTO_INCREMENT PRIMARY KEY,
  `movie_id` INT NOT NULL,
  `author` VARCHAR(150) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  CONSTRAINT `fk_review_movie`
    FOREIGN KEY (`movie_id`) REFERENCES `movie`(`movie_id`)
    ON DELETE CASCADE, -- deleting a movie deletes all of that movie's reviews
  INDEX `idx_review_movie` (`movie_id`)
) ENGINE=InnoDB;

CREATE TABLE `address` (
  `address_id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `street` VARCHAR(255) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `state` VARCHAR(100) NOT NULL,
  `zip_code` VARCHAR(20) NOT NULL,
  CONSTRAINT `fk_address_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customer`(`customer_id`)
    ON DELETE CASCADE, -- deleting a customer deletes their address
  CONSTRAINT `uq_address_customer` UNIQUE (`customer_id`) -- a customer can only store one address
) ENGINE=InnoDB;

CREATE TABLE `payment_card` (
  `card_id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `card_number` VARCHAR(255) NOT NULL,
  `last_four` CHAR(4) NOT NULL,
  `expiration_date` DATE NOT NULL,
  `billing_street` VARCHAR (100) NOT NULL,
  `billing_city` VARCHAR (100) NOT NULL,
  `billing_state`CHAR (2) NOT NULL, -- state initials (e.g. GA, FL, CA)
  `billing_zip_code` VARCHAR (20) NOT NULL,
  `billing_apt` VARCHAR (100), -- not required
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT `fk_payment_card_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customer`(`customer_id`)
    ON DELETE CASCADE, -- deleting a customer deletes their cards
  INDEX `idx_payment_card_customer` (`customer_id`),
  CONSTRAINT `uq_payment_card_card_customer` UNIQUE (card_id, customer_id) -- a card is only tied to one customer
) ENGINE=InnoDB;

CREATE TABLE `promotion` (
  `promotion_id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL,
  `description` TEXT,
  `discount_type` ENUM('Percent', 'Amount') NOT NULL DEFAULT 'Percent',
  `discount_value` DECIMAL(10,2) NOT NULL,
  `expiration_date` DATETIME NOT NULL,
  CONSTRAINT `uq_promotion_code` UNIQUE (`code`), -- promo codes must be unique
  CONSTRAINT `chk_discount_value_nonnegative` CHECK (`discount_value` >= 0) -- the discount value must be nonnegative
) ENGINE=InnoDB;

CREATE TABLE `booking_fee` (
  `fee_id` INT AUTO_INCREMENT PRIMARY KEY,
  `amount` DECIMAL(10,2) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT `chk_amount_nonnegative` CHECK (`amount` >= 0) -- the booking fee amount must be nonnegative
) ENGINE=InnoDB;

CREATE TABLE `booking` (
  `booking_id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `card_id` INT NOT NULL,
  `show_id` INT NOT NULL,
  `booking_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `promotion_id` INT,
  `fee_id` INT NOT NULL,
  `booking_fee_amount` DECIMAL(10,2) NOT NULL,
  `promotion_discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00, -- this is meant for the actual dollar amount that was discounted from the purchase
  `total_amount` DECIMAL(10,2) NOT NULL,
  `payment_reference` VARCHAR(100),
  CONSTRAINT `fk_booking_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customer`(`customer_id`)
    ON DELETE RESTRICT, -- deleting a customer cannot be done if that customer has a booking
  CONSTRAINT `fk_booking_card_owner`
    FOREIGN KEY (`card_id`, `customer_id`)
    REFERENCES payment_card(`card_id`, `customer_id`)
    ON DELETE RESTRICT, -- deleting a payment card cannot be done if that card was used in a booking
  CONSTRAINT `fk_booking_show`
    FOREIGN KEY (`show_id`) REFERENCES `show`(`show_id`)
    ON DELETE RESTRICT, -- deleting a show cannot be done if that show had a booking
  CONSTRAINT `fk_booking_promotion`
    FOREIGN KEY (`promotion_id`) REFERENCES `promotion`(`promotion_id`)
    ON DELETE RESTRICT, -- deleting a promotion cannot be done if that promotion was used in a booking
  CONSTRAINT `fk_booking_fee`
    FOREIGN KEY (`fee_id`) REFERENCES `booking_fee`(`fee_id`)
    ON DELETE RESTRICT, -- deleting a booking fee cannot be done if that booking fee was used in a booking
  INDEX `idx_booking_customer` (`customer_id`),
  INDEX `idx_booking_show` (`show_id`),
  CONSTRAINT `uq_booking_booking_show` UNIQUE (`booking_id`, `show_id`), -- a single booking can only involve one show
  CONSTRAINT `chk_booking_fee_amount_nonnegative` CHECK (`booking_fee_amount` >= 0), -- the booking fee amount must be nonnegative
  CONSTRAINT `chk_promotion_discount_amount_nonnegative` CHECK (`promotion_discount_amount` >= 0), -- the promotion discount amount must be nonnegative
  CONSTRAINT `chk_total_amount_nonnegative` CHECK (`total_amount` >= 0) -- the total amount must be nonnegative
) ENGINE=InnoDB;

CREATE TABLE `ticket_price` (
  `type` ENUM('Adult', 'Senior', 'Child') PRIMARY KEY,
  `price` DECIMAL(10,2) NOT NULL,
  CONSTRAINT `chk_price_nonnegative` CHECK (`price` >= 0) -- the ticket price must be nonnegative
) ENGINE=InnoDB;

CREATE TABLE `ticket` (
  `ticket_id` INT AUTO_INCREMENT PRIMARY KEY,
  `type` ENUM('Adult', 'Senior', 'Child') NOT NULL,
  `unit_price` DECIMAL(10,2) NOT NULL, -- the ticket’s stored base charged amount
  -- ^ this is entirely determined by the ticket type, but it is here for historical purposes in case the ticket prices change 
  `booking_id` INT NOT NULL,
  `seat_id` INT NOT NULL,
  `show_id` INT NOT NULL,
  `showroom_id` INT NOT NULL,
  CONSTRAINT `fk_ticket_booking_show`
    FOREIGN KEY (`booking_id`, `show_id`)
    REFERENCES `booking`(`booking_id`, `show_id`)
    ON DELETE CASCADE, -- deleting a booking deletes all tickets in the booking
  CONSTRAINT `fk_ticket_price`
    FOREIGN KEY (`type`) REFERENCES `ticket_price`(`type`)
    ON DELETE RESTRICT, -- deleting a ticket price category cannot be done if it has been used for a ticket
  CONSTRAINT `fk_ticket_show_showroom`
    FOREIGN KEY (`show_id`, `showroom_id`)
    REFERENCES `show`(`show_id`, `showroom_id`)
    ON DELETE RESTRICT, -- deleting a show cannot be done if a ticket references that show 
  CONSTRAINT `fk_ticket_seat_showroom`
    FOREIGN KEY (`seat_id`, `showroom_id`)
    REFERENCES `seat`(`seat_id`, `showroom_id`)
    ON DELETE RESTRICT, -- deleting a seat cannot be done if a ticket references that seat
  INDEX `idx_ticket_booking` (`booking_id`),
  INDEX `idx_ticket_seat` (`seat_id`),
  CONSTRAINT `uq_ticket_show_seat` UNIQUE (`show_id`, `seat_id`), -- a single ticket can only reference one seat at one show
  CONSTRAINT `chk_unit_price_nonnegative` CHECK (`unit_price` >= 0) -- the price to be paid for the ticket must be nonnegative
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