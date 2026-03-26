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
from sqlalchemy import (
    UniqueConstraint,
    Index,
    CheckConstraint,
    ForeignKeyConstraint,
    PrimaryKeyConstraint,
    Enum,
    func,
)
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
    __tablename__ = "movie"

    movie_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(255), nullable=False)
    genre = db.Column(db.String(100), nullable=False)
    status = db.Column(
        Enum("CURRENTLY_RUNNING", "COMING_SOON", "ARCHIVED", name="movie_status_enum"),
        nullable=False,
    )
    runtime = db.Column(db.Integer, nullable=False)
    synopsis = db.Column(db.Text)
    trailer_image_url = db.Column(db.String(255))
    trailer_video_url = db.Column(db.String(255))
    mpaa_rating = db.Column(db.String(10))

    __table_args__ = (
        Index("idx_movie_title", "title"),
        Index("idx_movie_genre", "genre"),
        Index("idx_movie_status", "status"),
        CheckConstraint("runtime > 0", name="chk_runtime_positive"),
    )

    shows = db.relationship("Show", back_populates="movie")
    contributors = db.relationship("MovieContributor", back_populates="movie", cascade="all, delete-orphan")
    reviews = db.relationship("Review", back_populates="movie", cascade="all, delete-orphan")

    def to_dict(self, *, include_shows: bool = False) -> dict:
        payload = {
            "movie_id": self.movie_id,
            "title": self.title,
            "genre": self.genre,
            "status": self.status,
            "runtime": self.runtime,
            "synopsis": self.synopsis,
            "trailer_image_url": self.trailer_image_url,
            "trailer_video_url": self.trailer_video_url,
            "mpaa_rating": self.mpaa_rating,
        }
        if include_shows:
            payload["shows"] = [s.to_dict() for s in self.shows]
        return payload


class User(db.Model):
    __tablename__ = "user"

    user_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True)
    phone_number = db.Column(db.String(25), unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_verified = db.Column(db.Boolean, nullable=False, default=False)
    status = db.Column(
        Enum("Active", "Inactive", "Suspended", name="user_status_enum"),
        nullable=False,
        default="Active",
    )


class Customer(db.Model):
    __tablename__ = "customer"

    customer_id = db.Column(db.Integer, db.ForeignKey("user.user_id", ondelete="CASCADE"), primary_key=True)
    promotion_opt_in = db.Column(db.Boolean, nullable=False, default=False)

    user = db.relationship("User", backref=db.backref("customer", uselist=False, passive_deletes=True))


class Admin(db.Model):
    __tablename__ = "admin"

    admin_id = db.Column(db.Integer, db.ForeignKey("user.user_id", ondelete="CASCADE"), primary_key=True)
    user = db.relationship("User", backref=db.backref("admin", uselist=False, passive_deletes=True))


class Showroom(db.Model):
    __tablename__ = "showroom"

    showroom_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    showroom_name = db.Column(db.String(50), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    shows = db.relationship("Show", back_populates="showroom")
    seats = db.relationship("Seat", back_populates="showroom")


class Show(db.Model):
    __tablename__ = "show"

    show_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    movie_id = db.Column(db.Integer, db.ForeignKey("movie.movie_id", ondelete="RESTRICT"), nullable=False)
    showroom_id = db.Column(
        db.Integer, db.ForeignKey("showroom.showroom_id", ondelete="RESTRICT"), nullable=False
    )
    start_time = db.Column(db.DateTime, nullable=False)

    __table_args__ = (
        UniqueConstraint("showroom_id", "start_time", name="uq_showroom_start_time"),
        UniqueConstraint("show_id", "showroom_id", name="uq_show_showroom"),
        Index("idx_show_movie", "movie_id"),
        Index("idx_show_start_time", "start_time"),
    )

    movie = db.relationship("Movie", back_populates="shows")
    showroom = db.relationship("Showroom", back_populates="shows")

    def to_dict(self) -> dict:
        return {
            "show_id": self.show_id,
            "movie_id": self.movie_id,
            "showroom_id": self.showroom_id,
            "start_time": self.start_time.isoformat() if self.start_time else None,
        }


class Seat(db.Model):
    __tablename__ = "seat"

    seat_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    showroom_id = db.Column(db.Integer, db.ForeignKey("showroom.showroom_id", ondelete="RESTRICT"), nullable=False)
    row_label = db.Column(db.String(10), nullable=False)
    seat_number = db.Column(db.Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("showroom_id", "row_label", "seat_number", name="uq_seat_in_showroom"),
        UniqueConstraint("seat_id", "showroom_id", name="uq_seat_showroom_pair"),
    )

    showroom = db.relationship("Showroom", back_populates="seats")


class MovieContributor(db.Model):
    __tablename__ = "movie_contributor"

    movie_id = db.Column(db.Integer, db.ForeignKey("movie.movie_id", ondelete="CASCADE"), nullable=False)
    person_name = db.Column(db.String(150), nullable=False)
    role = db.Column(db.String(100), nullable=False)

    __table_args__ = (
        PrimaryKeyConstraint("movie_id", "person_name", "role"),
    )

    movie = db.relationship("Movie", back_populates="contributors")


class Review(db.Model):
    __tablename__ = "review"

    review_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    movie_id = db.Column(db.Integer, db.ForeignKey("movie.movie_id", ondelete="CASCADE"), nullable=False)
    author = db.Column(db.String(150), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)

    __table_args__ = (Index("idx_review_movie", "movie_id"),)

    movie = db.relationship("Movie", back_populates="reviews")


class Address(db.Model):
    __tablename__ = "address"

    address_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    street = db.Column(db.String(255), nullable=False)
    city = db.Column(db.String(100), nullable=False)
    state = db.Column(db.String(100), nullable=False)
    zip_code = db.Column(db.String(20), nullable=False)

    __table_args__ = (UniqueConstraint("customer_id", name="uq_address_customer"),)


class PaymentCard(db.Model):
    __tablename__ = "payment_card"

    card_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    card_number = db.Column(db.String(25), nullable=False)
    expiration_date = db.Column(db.Date, nullable=False)
    billing_street = db.Column(db.String(100), nullable=False)
    billing_city = db.Column(db.String(100), nullable=False)
    billing_state = db.Column(db.String(2), nullable=False)
    billing_zip_code = db.Column(db.String(20), nullable=False)
    billing_apt = db.Column(db.String(100))
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    __table_args__ = (
        Index("idx_payment_card_customer", "customer_id"),
        UniqueConstraint("card_id", "customer_id", name="uq_payment_card_card_customer"),
    )


class Promotion(db.Model):
    __tablename__ = "promotion"

    promotion_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    code = db.Column(db.String(50), nullable=False, unique=True)
    description = db.Column(db.Text)
    discount_type = db.Column(
        Enum("Percent", "Amount", name="promotion_discount_type_enum"),
        nullable=False,
        default="Percent",
    )
    discount_value = db.Column(db.Numeric(10, 2), nullable=False)
    expiration_date = db.Column(db.DateTime, nullable=False)

    __table_args__ = (
        CheckConstraint("discount_value >= 0", name="chk_discount_value_nonnegative"),
    )


class BookingFee(db.Model):
    __tablename__ = "booking_fee"

    fee_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    __table_args__ = (CheckConstraint("amount >= 0", name="chk_amount_nonnegative"),)


class Booking(db.Model):
    __tablename__ = "booking"

    booking_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.customer_id", ondelete="RESTRICT"), nullable=False)
    card_id = db.Column(db.Integer, nullable=False)
    show_id = db.Column(db.Integer, db.ForeignKey("show.show_id", ondelete="RESTRICT"), nullable=False)
    booking_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    promotion_id = db.Column(db.Integer, db.ForeignKey("promotion.promotion_id", ondelete="RESTRICT"))
    fee_id = db.Column(db.Integer, db.ForeignKey("booking_fee.fee_id", ondelete="RESTRICT"), nullable=False)
    booking_fee_amount = db.Column(db.Numeric(10, 2), nullable=False)
    promotion_discount_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0.00)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_reference = db.Column(db.String(100))

    __table_args__ = (
        ForeignKeyConstraint(
            ["card_id", "customer_id"],
            ["payment_card.card_id", "payment_card.customer_id"],
            ondelete="RESTRICT",
            name="fk_booking_card_owner",
        ),
        Index("idx_booking_customer", "customer_id"),
        Index("idx_booking_show", "show_id"),
        UniqueConstraint("booking_id", "show_id", name="uq_booking_booking_show"),
        CheckConstraint("booking_fee_amount >= 0", name="chk_booking_fee_amount_nonnegative"),
        CheckConstraint("promotion_discount_amount >= 0", name="chk_promotion_discount_amount_nonnegative"),
        CheckConstraint("total_amount >= 0", name="chk_total_amount_nonnegative"),
    )


class TicketPrice(db.Model):
    __tablename__ = "ticket_price"

    type = db.Column(Enum("Adult", "Senior", "Child", name="ticket_type_enum"), primary_key=True)
    price = db.Column(db.Numeric(10, 2), nullable=False)

    __table_args__ = (CheckConstraint("price >= 0", name="chk_price_nonnegative"),)


class Ticket(db.Model):
    __tablename__ = "ticket"

    ticket_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    type = db.Column(Enum("Adult", "Senior", "Child", name="ticket_type_enum"), nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    booking_id = db.Column(db.Integer, nullable=False)
    seat_id = db.Column(db.Integer, nullable=False)
    show_id = db.Column(db.Integer, nullable=False)
    showroom_id = db.Column(db.Integer, nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ["booking_id", "show_id"],
            ["booking.booking_id", "booking.show_id"],
            ondelete="CASCADE",
            name="fk_ticket_booking_show",
        ),
        ForeignKeyConstraint(["type"], ["ticket_price.type"], ondelete="RESTRICT", name="fk_ticket_price"),
        ForeignKeyConstraint(
            ["show_id", "showroom_id"],
            ["show.show_id", "show.showroom_id"],
            ondelete="RESTRICT",
            name="fk_ticket_show_showroom",
        ),
        ForeignKeyConstraint(
            ["seat_id", "showroom_id"],
            ["seat.seat_id", "seat.showroom_id"],
            ondelete="RESTRICT",
            name="fk_ticket_seat_showroom",
        ),
        Index("idx_ticket_booking", "booking_id"),
        Index("idx_ticket_seat", "seat_id"),
        UniqueConstraint("show_id", "seat_id", name="uq_ticket_show_seat"),
        CheckConstraint("unit_price >= 0", name="chk_unit_price_nonnegative"),
    )


class FavoriteMovie(db.Model):
    __tablename__ = "favorite_movie"

    customer_id = db.Column(db.Integer, db.ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    movie_id = db.Column(db.Integer, db.ForeignKey("movie.movie_id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (PrimaryKeyConstraint("customer_id", "movie_id"),)


class Recommendation(db.Model):
    __tablename__ = "recommendation"

    recommendation_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    generated_on = db.Column(db.DateTime, nullable=False, server_default=func.current_timestamp())

    __table_args__ = (Index("idx_recommendation_customer", "customer_id"),)


class RecommendationMovie(db.Model):
    __tablename__ = "recommendation_movie"

    recommendation_id = db.Column(
        db.Integer, db.ForeignKey("recommendation.recommendation_id", ondelete="CASCADE"), nullable=False
    )
    movie_id = db.Column(db.Integer, db.ForeignKey("movie.movie_id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (PrimaryKeyConstraint("recommendation_id", "movie_id"),)


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

        q = q.join(Movie.shows).filter(func.date(Show.start_time) == show_date).distinct()

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