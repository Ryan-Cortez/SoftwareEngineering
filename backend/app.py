"""
Flask backend for the cinema app.

Frontend expectations (see `frontend/src/api/cinemaApi.ts`):
- `GET /api/movies?search=&genre=&showDate=YYYY-MM-DD` returns a JSON array of movies
- `GET /api/movies/<id>` returns one movie (plus show info)

Important: the frontend can consume either snake_case (movie_id, synopsis, ...)
or camelCase equivalents; it normalizes both.
"""

from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint, Index
from datetime import datetime
import os
from flask_cors import CORS

# Flask application instance. In production you may create this via an app factory,
# but keeping it module-level is fine for a small project.
app = Flask(__name__)

# Allow cross-origin requests so the Vite dev server (localhost:5173) can call the API.
# This enables CORS for all routes and methods; you can tighten this later if needed.
CORS(app)

from dotenv import load_dotenv
load_dotenv()

# Database connection string.
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["SQLALCHEMY_DATABASE_URI"]

# Disables a feature that adds overhead and is usually not needed.
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# SQLAlchemy integration with Flask.
db = SQLAlchemy(app)

class Movie(db.Model):
    __tablename__ = 'movie'

    # Core movie metadata. Field names mirror the existing DB schema (snake_case).
    movie_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(255), nullable=False)
    genre = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    synopsis = db.Column(db.Text)
    trailer_image_url = db.Column(db.String(255))
    trailer_video_url = db.Column(db.String(255))
    mpaa_rating = db.Column(db.String(10))
    
    # Indexes speed up the common filters/searches you’ll do from the UI.
    __table_args__ = (
        Index('idx_movie_title', 'title'),
        Index('idx_movie_genre', 'genre'),
        Index('idx_movie_status', 'status'),
    )
    
    # Relationship to scheduled shows.
    # `delete-orphan` means a Show row can't exist without its parent Movie; when a
    # movie is deleted, its shows are also deleted.
    shows = db.relationship('Show', back_populates='movie', cascade='all, delete-orphan')

    def __repr__(self):
        return f"{self.movie_id}. {self.title}"

    def to_dict(self, *, include_shows: bool = False) -> dict:
        """
        JSON-serializable representation.

        We intentionally return snake_case to match the DB schema; the frontend
        normalizes these names to its own `Movie` type.
        """
        payload = {
            "movie_id": self.movie_id,
            "title": self.title,
            "genre": self.genre,
            "status": self.status,
            "synopsis": self.synopsis,
            "trailer_image_url": self.trailer_image_url,
            "trailer_video_url": self.trailer_video_url,
            "mpaa_rating": self.mpaa_rating,
        }
        if include_shows:
            payload["shows"] = [s.to_dict() for s in self.shows]
        return payload

class Hall(db.Model):
    __tablename__ = 'hall'
    hall_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    hall_name = db.Column(db.String(50), nullable=False)
    
    # A hall can have many shows.
    shows = db.relationship('Show', back_populates='hall')

    def __repr__(self):
        return f"{self.hall_id}. {self.hall_name}"
    
class Show(db.Model):
    __tablename__ = 'show'
    show_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Foreign keys enforce referential integrity at the DB level.
    # - CASCADE: deleting a movie deletes its shows
    # - RESTRICT: prevents deleting a hall if shows still reference it
    movie_id = db.Column(db.Integer, db.ForeignKey('movie.movie_id', ondelete='CASCADE'), nullable=False)
    hall_id = db.Column(db.Integer, db.ForeignKey('hall.hall_id', ondelete='RESTRICT'), nullable=False)
    show_date = db.Column(db.Date, nullable=False)
    show_time = db.Column(db.Time, nullable=False)
    
    __table_args__ = (
        # Prevents double-booking the same hall for the same date/time.
        UniqueConstraint('hall_id', 'show_date', 'show_time', name='uq_show_hall_date_time'),
        Index('idx_show_movie', 'movie_id'),
        Index('idx_show_date', 'show_date'),
    )
    
    movie = db.relationship('Movie', back_populates='shows')
    hall = db.relationship('Hall', back_populates='shows')

    def __repr__(self):
        return f"{self.show_id}. {self.movie.title} at {self.show_time} on {self.show_date}"

    def to_dict(self) -> dict:
        # Convert Date/Time objects to strings so `jsonify()` can serialize them.
        return {
            "show_id": self.show_id,
            "movie_id": self.movie_id,
            "hall_id": self.hall_id,
            "show_date": self.show_date.isoformat(),  # "YYYY-MM-DD"
            # The frontend is happy with any string; choose a readable one.
            "show_time": self.show_time.strftime("%H:%M"),
        }


@app.get("/api/movies")
def get_movies():
    """
    List movies for the frontend.

    Query parameters expected by the React app:
    - search: optional text to match in the title
    - genre: optional exact genre match
    - showDate: optional YYYY-MM-DD date to filter by show date

    Should return a JSON array of movie objects. Each movie can use either
    snake_case field names (movie_id, synopsis, trailer_image_url, etc.)
    or camelCase equivalents; the frontend normalizes both.
    """
    # Raw query strings; treat blank/whitespace as "no filter".
    search = (request.args.get("search") or "").strip()
    genre = (request.args.get("genre") or "").strip()
    show_date_raw = (request.args.get("showDate") or "").strip()

    # Start from the base Movie query and add filters as the UI supplies them.
    q = Movie.query

    # Case-insensitive substring match for titles.
    if search:
        q = q.filter(Movie.title.ilike(f"%{search}%"))

    # Exact match genre filter
    if genre:
        q = q.filter(Movie.genre == genre)

    # Filter movies that have at least one show on a given date.
    if show_date_raw:
        try:
            show_date = datetime.strptime(show_date_raw, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "showDate must be YYYY-MM-DD"}), 400

        q = q.join(Movie.shows).filter(Show.show_date == show_date).distinct()

    movies = q.all()
    return jsonify([m.to_dict(include_shows=False) for m in movies])

@app.get("/api/movies/<int:movie_id>")
def get_movie(movie_id: int):
    """
    Get details for a single movie, including its showtimes.

    The frontend expects:
    - A movie object with fields like:
      movie_id, title, genre, status, synopsis, trailer_image_url,
      trailer_video_url, mpaa_rating
    - EITHER:
      - "showtimes": list[str]  (e.g. ["2:00 PM", "5:00 PM"])
      OR
      - "shows": list[{"show_time": str, ...}] built from Show rows.
    """
    # `.get_or_404()` will return a 404 response if no movie exists.
    movie = Movie.query.get_or_404(movie_id)

    # Include `shows` so the frontend can derive showtimes (it already knows how).
    return jsonify(movie.to_dict(include_shows=True))