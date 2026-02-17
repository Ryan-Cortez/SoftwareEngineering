# Core Entities

## movie

| Component Name     | Data Type      | Primary Key | Foreign Key | Notes    |
|-------------------|----------------|:------------:|-------------|----------|
| movie_id           | INT            | YES          |             | NOT NULL |
| title              | VARCHAR(255)   |             |             | NOT NULL |
| genre              | VARCHAR(100)   |             |             | NOT NULL |
| status             | VARCHAR(20)    |             |             | NOT NULL |
| synopsis           | TEXT           |             |             |          |
| trailer_image_url  | VARCHAR(255)   |             |             |          |
| trailer_video_url  | VARCHAR(255)   |             |             |          |
| mpaa_rating        | VARCHAR(10)    |             |             |          |

---

## show

| Component Name | Data Type | Primary Key | Foreign Key                 | Notes    |
|----------------|-----------|:-----------:|-----------------------------|----------|
| show_id         | INT      |    YES      |                             | NOT NULL |
| movie_id        | INT      |             | to movie(movie_id)           | NOT NULL |
| hall_id         | INT      |             | to hall(hall_id)             | NOT NULL |
| show_date       | DATE     |             |                             | NOT NULL |
| show_time       | TIME     |             |                             | NOT NULL |

**Constraints**
- `UNIQUE(hall_id, show_date, show_time)` (prevents two shows in the same hall at the same time)