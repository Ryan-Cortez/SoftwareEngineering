


## Query: Filter Movies by Genre

**Description:**  
Returns all movies matching a selected genre.

```sql
SELECT movie_id, title, genre, status, synopsis,
       trailer_image_url, trailer_video_url, mpaa_rating
FROM movie
WHERE genre = ?;
```

---

## Query: Search Movies by Title

**Description:**  
Returns all movies whose title contains the search term.

```sql
SELECT movie_id, title, genre, status, synopsis,
       trailer_image_url, trailer_video_url, mpaa_rating
FROM movie
WHERE title LIKE CONCAT('%', ?, '%');
```