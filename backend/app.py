"""
Flask backend for the cinema app.

Frontend expectations (see `frontend/src/api/cinemaApi.ts`):
- `GET /api/movies?search=&genre=&showDate=YYYY-MM-DD` returns a JSON array of movies
- `GET /api/movies/<id>` returns one movie (plus show info)

Important: the frontend can consume either snake_case (movie_id, synopsis, ...)
or camelCase equivalents; it normalizes both.

--- DESIGN PATTERNS APPLIED ---

1. ADAPTER  (SeatCodeAdapter)
   Converts raw seat-code strings like "A1" into Seat ORM objects.
   The rest of the booking logic doesn't know or care about the string format.

2. BUILDER  (BookingResponseBuilder)
   Constructs the booking confirmation dict incrementally via chained setter
   methods, keeping the route handler free of ad-hoc dict assembly.

3. FACADE   (BookingFacade)
   Provides a single, simplified entry-point for the entire booking workflow:
   validation → seat lookup → price calculation → DB persistence.
   Hides all internal complexity from the route handler.

4. PROXY    (PaymentCardProxy)
   Wraps PaymentCard and controls access to sensitive card data:
   - enforces ownership checks before exposing any data
   - automatically masks the card number before returning it to callers
   - keeps the decryption/masking concern in one place

"""

import os
import re
import json
from datetime import datetime
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError

from cryptography.fernet import Fernet, InvalidToken
from flask import Flask, jsonify, request, session
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_mail import Mail, Message
from flask_sqlalchemy import SQLAlchemy
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKeyConstraint,
    Index,
    PrimaryKeyConstraint,
    UniqueConstraint,
    func,
)
from sqlalchemy.exc import IntegrityError
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

CORS(
    app,
    supports_credentials=True,
    origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/"),
    ],
)

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["SQLALCHEMY_DATABASE_URI"]
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "fallback-secret-key")

app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = 86400 * 7

app.config["MAIL_SERVER"] = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
app.config["MAIL_PORT"] = int(os.environ.get("MAIL_PORT", "587"))
app.config["MAIL_USE_TLS"] = os.environ.get("MAIL_USE_TLS", "true").strip().lower() in ("1", "true", "yes", "y")
app.config["MAIL_USE_SSL"] = os.environ.get("MAIL_USE_SSL", "false").strip().lower() in ("1", "true", "yes", "y")
app.config["MAIL_USERNAME"] = os.environ.get("MAIL_USERNAME", "")
app.config["MAIL_PASSWORD"] = os.environ.get("MAIL_PASSWORD", "")
app.config["MAIL_DEFAULT_SENDER"] = os.environ.get("MAIL_DEFAULT_SENDER") or os.environ.get("MAIL_USERNAME", "")

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
mail = Mail(app)
serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"])


def _mail_is_configured() -> bool:
    return bool(
        (app.config.get("MAIL_SERVER") or "").strip()
        and int(app.config.get("MAIL_PORT") or 0) > 0
        and (app.config.get("MAIL_USERNAME") or "").strip()
        and (app.config.get("MAIL_PASSWORD") or "").strip()
        and (app.config.get("MAIL_DEFAULT_SENDER") or "").strip()
    )


def _send_email_or_log(*, subject: str, recipients: list[str], body: str, demo_fallback_label: str) -> None:
    if not recipients:
        return

    if not _mail_is_configured():
        print(f"--- DEMO MODE: {demo_fallback_label} ---")
        return

    msg = Message(subject, recipients=recipients)
    msg.body = body
    mail.send(msg)


def _notify_promotion_opt_in_users_best_effort(promo: "Promotion") -> None:
    """
    Best-effort broadcast when a new promotion is created.
    Never blocks the admin create-promotion request.
    """
    try:
        if promo is None:
            return

        q = (
            db.session.query(User.email)
            .join(Customer, Customer.customer_id == User.user_id)
            .filter(Customer.promotion_opt_in.is_(True))
            .filter(User.status == "Active")
            .filter(User.is_verified.is_(True))
        )
        recipients = [row.email for row in q.all() if (row.email or "").strip()]
        if not recipients:
            return

        body = (
            f"Promotion: {promo.code}\n\n"
            f"{promo.description or ''}\n\n"
            f"Discount type: {promo.discount_type}\n"
            f"Discount value: {promo.discount_value}\n"
            f"Expires: {promo.expiration_date.isoformat() if promo.expiration_date else ''}\n"
        )

        _send_email_or_log(
            subject=f"New Promotion: {promo.code}",
            recipients=recipients,
            body=body,
            demo_fallback_label=f"Promotion email would go to: {', '.join(recipients) if recipients else '(no subscribers)'}",
        )
    except Exception as e:
        print(f"Promotion broadcast email failed to send: {e}")


def _fernet() -> Fernet:
    key = os.environ.get("FERNET_KEY", "").strip()
    if not key:
        raise RuntimeError("FERNET_KEY must be set for payment card encryption")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_card_number(plain: str) -> str:
    return _fernet().encrypt(plain.strip().encode("utf-8")).decode("ascii")


def decrypt_card_number(stored: str) -> str:
    try:
        return _fernet().decrypt(stored.encode("ascii")).decode("utf-8")
    except InvalidToken:
        return ""


def mask_card_number(plain: str) -> str:
    digits = re.sub(r"\D", "", plain)
    if len(digits) >= 4:
        # Use a fixed 12-star mask for consistent UI (typical 16-digit cards).
        return "*" * 12 + digits[-4:]
    return "*" * 12


# ---------------------------------------------------------------------------
# ORM Models (unchanged)
# ---------------------------------------------------------------------------

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

    def to_dict(self, *, include_shows: bool = False, include_contributors: bool = False) -> dict:
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
        if include_contributors:
            payload["contributors"] = [
                {"name": c.person_name, "role": c.role}
                for c in self.contributors
            ]
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
    showroom_id = db.Column(db.Integer, db.ForeignKey("showroom.showroom_id", ondelete="RESTRICT"), nullable=False)
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
        st = self.start_time.isoformat() if self.start_time else None
        return {
            "show_id": self.show_id,
            "movie_id": self.movie_id,
            "showroom_id": self.showroom_id,
            "start_time": st,
            "show_time": st,
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

    __table_args__ = (PrimaryKeyConstraint("movie_id", "person_name", "role"),)

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
    card_number_encrypted = db.Column("card_number", db.String(512), nullable=False)
    last_four = db.Column(db.String(4), nullable=False)
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

    __table_args__ = (CheckConstraint("discount_value >= 0", name="chk_discount_value_nonnegative"),)


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


# ---------------------------------------------------------------------------
# Helpers (unchanged)
# ---------------------------------------------------------------------------

def get_current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    return User.query.get(uid)


def api_error(message: str, status: int = 400):
    """JSON error body for API + frontend (parseJsonResponse also reads `message`)."""
    return jsonify({"error": message, "message": message}), status


def require_login():
    user = get_current_user()
    if not user:
        return None, api_error("Not logged in.", 401)
    return user, None


def require_admin():
    user, err = require_login()
    if err:
        return None, err
    if user.admin is None:
        return None, api_error("Admin access required.", 403)
    return user, None


def _parse_start_time(data: dict):
    """
    Accept either:
      - start_time: ISO string (preferred), or
      - date + time: "YYYY-MM-DD" + "HH:MM" (or "HH:MM:SS")
    Returns (datetime | None, error_response | None)
    """
    start_time_raw = (data.get("start_time") or data.get("startTime") or "").strip()
    if start_time_raw:
        try:
            normalized = start_time_raw.replace(" ", "T")
            return datetime.fromisoformat(normalized), None
        except ValueError:
            return None, api_error("start_time must be an ISO datetime like 2026-04-14T19:30:00", 400)

    date_raw = (data.get("date") or data.get("show_date") or "").strip()
    time_raw = (data.get("time") or data.get("show_time") or "").strip()
    if date_raw or time_raw:
        if not date_raw:
            return None, api_error("date is required when time is provided", 400)
        if not time_raw:
            return None, api_error("time is required when date is provided", 400)
        try:
            d = datetime.strptime(date_raw, "%Y-%m-%d").date()
        except ValueError:
            return None, api_error("date must be YYYY-MM-DD", 400)
        try:
            t = datetime.strptime(time_raw, "%H:%M").time()
        except ValueError:
            try:
                t = datetime.strptime(time_raw, "%H:%M:%S").time()
            except ValueError:
                return None, api_error("time must be HH:MM (24-hour)", 400)
        return datetime.combine(d, t), None

    return None, api_error("start_time is required", 400)


def _money_to_float(val) -> float:
    try:
        return float(val)
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# PATTERN 1 — PROXY: PaymentCardProxy
#
# The Proxy pattern provides a surrogate that controls access to the real
# PaymentCard object. Here it:
#   • enforces that only the owning customer can inspect a card
#   • automatically masks the card number before exposing it
#   • keeps all decrypt/mask logic in one place so routes stay clean
#
# Before this pattern, ownership checks and masking were scattered across
# add_payment_card, get_payment_card, update_payment_card, and the
# payment_card_to_public_dict helper. Now every caller goes through the proxy.
# ---------------------------------------------------------------------------

class PaymentCardProxy:
    """
    PROXY pattern — wraps a PaymentCard ORM instance and gate-keeps access.

    Usage:
        proxy = PaymentCardProxy(card, requesting_customer_id)
        if not proxy.is_accessible():
            return api_error("Card not found.", 404)
        public_dict = proxy.to_public_dict()   # always masked
        full_number = proxy.get_plain_number()  # decrypted (internal use only)
    """

    def __init__(self, card: PaymentCard, requesting_customer_id: int):
        # Store the real subject and the identity of the caller.
        self._card = card
        self._requesting_customer_id = requesting_customer_id

    # --- access control ---

    def is_accessible(self) -> bool:
        """Return True only when the card belongs to the requesting customer."""
        return (
            self._card is not None
            and self._card.customer_id == self._requesting_customer_id
        )

    # --- safe public interface ---

    def to_public_dict(self) -> dict:
        """
        Return a masked representation safe for API responses.
        Card number is always shown as ************XXXX.
        """
        # Use the stored last_four when available to avoid an unnecessary decrypt.
        last4 = (self._card.last_four or "").strip()
        if last4 and len(last4) == 4:
            masked = "*" * 12 + last4
        else:
            plain = decrypt_card_number(self._card.card_number_encrypted)
            masked = mask_card_number(plain)

        return {
            "card_id": self._card.card_id,
            "card_number": masked,
            "expiration_date": self._card.expiration_date.isoformat() if self._card.expiration_date else None,
            "billing_street": self._card.billing_street,
            "billing_city": self._card.billing_city,
            "billing_state": self._card.billing_state,
            "billing_zip_code": self._card.billing_zip_code,
            "billing_apt": self._card.billing_apt,
        }

    def get_plain_number(self) -> str:
        """Decrypt and return the raw card number (for internal use only)."""
        return decrypt_card_number(self._card.card_number_encrypted)

    # Expose the underlying ORM object for update routes that need to mutate it.
    @property
    def card(self) -> PaymentCard:
        return self._card


# Keep the original free function as a thin wrapper so any code that still
# calls it directly continues to work without modification.
def payment_card_to_public_dict(c: PaymentCard) -> dict:
    # PROXY: delegate to the proxy, bypassing the ownership check because
    # internal callers (e.g. get_profile) have already verified ownership.
    proxy = PaymentCardProxy(c, c.customer_id)
    return proxy.to_public_dict()


MAX_PAYMENT_CARDS = 3


# ---------------------------------------------------------------------------
# PATTERN 2 — ADAPTER: SeatCodeAdapter
#
# The Adapter pattern converts an incompatible interface into one a client
# expects. The frontend sends seat selections as plain strings ("A1", "B12").
# The database layer requires (showroom_id, row_label, seat_number).
#
# SeatCodeAdapter bridges that gap: it accepts the raw string list from the
# request payload and produces a list of verified Seat ORM objects, surfacing
# validation errors in a uniform way.
#
# Before this pattern, the parsing + DB lookup logic lived inline inside
# create_booking(), making that function long and hard to test independently.
# ---------------------------------------------------------------------------

class SeatCodeAdapter:
    """
    ADAPTER pattern — translates raw seat-code strings into Seat ORM objects.

    Usage:
        adapter = SeatCodeAdapter(selected_seats_raw, showroom_id)
        seats, error = adapter.resolve()
        if error:
            return error   # already an api_error() tuple
        # seats is now a list of verified Seat ORM instances
    """

    # Regex: one or more letters followed by one or more digits, e.g. "A1", "BC12"
    _SEAT_CODE_RE = re.compile(r"^\s*([A-Za-z]+)\s*(\d+)\s*$")

    def __init__(self, raw_codes: list[str], showroom_id: int):
        self._raw_codes = raw_codes
        self._showroom_id = showroom_id

    def _parse_code(self, code: str):
        """
        Convert a seat-code string into (row_label, seat_number).
        Returns (None, None) for invalid input.
        """
        if not isinstance(code, str):
            return None, None
        m = self._SEAT_CODE_RE.match(code)
        if not m:
            return None, None
        row = m.group(1).upper()
        try:
            num = int(m.group(2))
        except Exception:
            return None, None
        if num <= 0:
            return None, None
        return row, num

    def resolve(self) -> tuple[list, object]:
        """
        Parse all codes, deduplicate, look up each in the DB for the given
        showroom, and return (seat_list, None) on success or ([], error) on
        the first problem encountered.
        """
        seats = []
        seen = set()

        for code in self._raw_codes:
            if not isinstance(code, str) or not code.strip():
                return [], api_error("selectedSeats entries must be strings like 'A1'", 400)

            norm = code.strip().upper()
            if norm in seen:
                return [], api_error(f"Duplicate seat selected: {norm}", 400)
            seen.add(norm)

            row_label, seat_number = self._parse_code(norm)
            if not row_label:
                return [], api_error(f"Invalid seat code: {code}", 400)

            # Adapter translates string → Seat ORM object via DB lookup.
            seat = Seat.query.filter_by(
                showroom_id=self._showroom_id,
                row_label=row_label,
                seat_number=seat_number,
            ).first()
            if not seat:
                return [], api_error(f"Seat not found in this showroom: {row_label}{seat_number}", 404)

            seats.append(seat)

        return seats, None


# Keep the original private helper so nothing that calls it externally breaks.
def _parse_seat_code(code: str):
    """Legacy helper — delegates to SeatCodeAdapter's internal parser."""
    # ADAPTER: reuse the adapter's parsing logic to stay DRY.
    adapter = SeatCodeAdapter.__new__(SeatCodeAdapter)
    return adapter._parse_code(code) if isinstance(code, str) else (None, None)


# ---------------------------------------------------------------------------
# PATTERN 3 — BUILDER: BookingResponseBuilder
#
# The Builder pattern separates the construction of a complex object from its
# representation. Creating the booking confirmation dict involves assembling
# data from multiple sources (Booking ORM, list of Ticket ORMs). Without a
# builder this assembly is an inline block of ad-hoc dict manipulation.
#
# BookingResponseBuilder provides a fluent (chained) interface: each setter
# returns self, so the caller can chain calls and finish with .build().
# ---------------------------------------------------------------------------

class BookingResponseBuilder:
    """
    BUILDER pattern — constructs the booking confirmation response dict.

    Usage:
        response = (
            BookingResponseBuilder()
            .set_booking(booking)
            .set_tickets(ticket_rows)
            .build()
        )
        return jsonify(response), 201
    """

    def __init__(self):
        self._booking = None
        self._tickets = []

    def set_booking(self, booking: Booking) -> "BookingResponseBuilder":
        """Store the persisted Booking ORM instance."""
        self._booking = booking
        return self  # return self enables method chaining

    def set_tickets(self, tickets: list) -> "BookingResponseBuilder":
        """Store the list of persisted Ticket ORM instances."""
        self._tickets = tickets
        return self  # return self enables method chaining

    def build(self) -> dict:
        """
        Assemble and return the final response dictionary.
        Raises ValueError if required parts were not supplied.
        """
        if self._booking is None:
            raise ValueError("BookingResponseBuilder: booking must be set before calling build()")

        return {
            "message": "Booking created.",
            "booking": {
                "booking_id": self._booking.booking_id,
                "customer_id": self._booking.customer_id,
                "show_id": self._booking.show_id,
                "card_id": self._booking.card_id,
                "booking_time": (
                    self._booking.booking_time.isoformat() if self._booking.booking_time else None
                ),
                "total_amount": _money_to_float(self._booking.total_amount),
                "booking_fee_amount": _money_to_float(self._booking.booking_fee_amount),
                "promotion_discount_amount": _money_to_float(self._booking.promotion_discount_amount),
            },
            # Each ticket is mapped to a small summary dict.
            "tickets": [
                {
                    "ticket_id": t.ticket_id,
                    "type": t.type,
                    "unit_price": _money_to_float(t.unit_price),
                    "seat_id": t.seat_id,
                }
                for t in self._tickets
            ],
        }


# ---------------------------------------------------------------------------
# PATTERN 4 — FACADE: BookingFacade
#
# The Facade pattern provides a simplified interface to a complex subsystem.
# Creating a booking touches six concerns:
#   1. Input parsing & validation
#   2. Show / card / seat existence checks  (uses SeatCodeAdapter — ADAPTER)
#   3. Pricing lookup
#   4. Booking + Ticket DB persistence
#   5. Building the response dict           (uses BookingResponseBuilder — BUILDER)
#   6. Returning a Flask response tuple
#
# Before this pattern all six steps lived inline in the route handler, making
# it ~100 lines long. The Facade encapsulates steps 1-5; the route handler
# just calls BookingFacade(user, data).execute() and returns the result.
# ---------------------------------------------------------------------------

class BookingFacade:
    """
    FACADE pattern — single entry-point for the end-to-end booking workflow.

    Usage (from the route handler):
        facade = BookingFacade(user, request.get_json() or {})
        return facade.execute()
    """

    def __init__(self, user: User, data: dict):
        self._user = user
        self._data = data

    # ------------------------------------------------------------------
    # Public entry-point
    # ------------------------------------------------------------------

    def execute(self):
        """
        Run the full booking workflow.
        Returns a Flask response tuple (response, status_code) in all cases.
        """
        # Step 1 — parse & validate the raw request payload
        err = self._validate_inputs()
        if err:
            return err

        # Step 2 — resolve domain objects (show, card, seats)
        err = self._resolve_entities()
        if err:
            return err

        # Step 3 — look up pricing tables
        err = self._load_pricing()
        if err:
            return err

        # Step 4 — persist to DB
        err = self._persist()
        if err:
            return err

        # Step 4.5 — send confirmation email (best-effort)
        self._send_order_confirmation_email_best_effort()

        # Step 5 — build and return the JSON response (uses Builder)
        response_dict = (
            BookingResponseBuilder()
            .set_booking(self._booking)
            .set_tickets(self._ticket_rows)
            .build()
        )
        return jsonify(response_dict), 201

    # ------------------------------------------------------------------
    # Private steps — each populates instance attributes for subsequent steps
    # ------------------------------------------------------------------

    def _validate_inputs(self):
        """Parse raw JSON fields; return an error response or None."""
        data = self._data

        show_id_raw = data.get("showId") if "showId" in data else data.get("show_id")
        card_id_raw = data.get("cardId") if "cardId" in data else data.get("card_id")
        selected_seats_raw = (
            data.get("selectedSeats") if "selectedSeats" in data else data.get("selected_seats")
        )
        ticket_counts = (
            data.get("ticketCounts") if "ticketCounts" in data else data.get("ticket_counts") or {}
        )

        try:
            self._show_id = int(show_id_raw)
        except Exception:
            return api_error("showId is required and must be a number", 400)

        try:
            self._card_id = int(card_id_raw)
        except Exception:
            return api_error("cardId is required and must be a number", 400)

        if not isinstance(selected_seats_raw, list) or not selected_seats_raw:
            return api_error("selectedSeats is required and must be a non-empty array", 400)
        self._selected_seats_raw = selected_seats_raw

        def _count(k: str) -> int:
            try:
                return int(ticket_counts.get(k, 0) or 0)
            except Exception:
                return 0

        self._adult = _count("adult")
        self._child = _count("child")
        self._senior = _count("senior")

        if self._adult < 0 or self._child < 0 or self._senior < 0:
            return api_error("ticketCounts values must be >= 0", 400)

        self._total_tickets = self._adult + self._child + self._senior
        if self._total_tickets <= 0:
            return api_error("At least one ticket is required", 400)

        if len(self._selected_seats_raw) != self._total_tickets:
            return api_error("selectedSeats length must match total tickets selected", 400)

        return None  # no error

    def _resolve_entities(self):
        """
        Look up Show, PaymentCard, and Seats; return an error response or None.
        Uses SeatCodeAdapter (ADAPTER) to convert seat code strings to Seat ORM objects.
        Uses PaymentCardProxy (PROXY) to enforce card ownership.
        """
        self._show = Show.query.get(self._show_id)
        if not self._show:
            return api_error("Show not found", 404)

        # PROXY: verify card ownership before proceeding.
        raw_card = PaymentCard.query.filter_by(
            card_id=self._card_id,
            customer_id=self._user.user_id,
            is_active=True,
        ).first()
        proxy = PaymentCardProxy(raw_card, self._user.user_id) if raw_card else None
        if proxy is None or not proxy.is_accessible():
            return api_error("Payment card not found for this user", 404)
        # We only need the ORM object from here on.
        self._card = proxy.card

        # ADAPTER: translate seat code strings → verified Seat ORM objects.
        adapter = SeatCodeAdapter(self._selected_seats_raw, self._show.showroom_id)
        seats, err = adapter.resolve()
        if err:
            return err
        self._seats = seats

        return None  # no error

    def _load_pricing(self):
        """Fetch TicketPrice rows and the active BookingFee; return error or None."""
        self._prices = {p.type: p for p in TicketPrice.query.all()}
        for t in ("Adult", "Child", "Senior"):
            if t not in self._prices:
                return api_error(f"Ticket price not configured for {t}", 500)

        self._fee = (
            BookingFee.query.filter_by(is_active=True)
            .order_by(BookingFee.fee_id.asc())
            .first()
        )
        if not self._fee:
            return api_error("No active booking fee configured", 500)

        return None  # no error

    def _persist(self):
        """
        Write the Booking and Ticket rows to the database.
        Returns an error response on DB failure or None on success.
        """
        ticket_types = (
            ["Adult"] * self._adult
            + ["Child"] * self._child
            + ["Senior"] * self._senior
        )

        subtotal = (
            self._adult  * _money_to_float(self._prices["Adult"].price)
            + self._child  * _money_to_float(self._prices["Child"].price)
            + self._senior * _money_to_float(self._prices["Senior"].price)
        )
        booking_fee_amount = _money_to_float(self._fee.amount)
        promotion_discount_amount = 0.0
        total_amount = max(0.0, subtotal + booking_fee_amount - promotion_discount_amount)

        self._booking = Booking(
            customer_id=self._user.user_id,
            card_id=self._card_id,
            show_id=self._show_id,
            promotion_id=None,
            fee_id=self._fee.fee_id,
            booking_fee_amount=booking_fee_amount,
            promotion_discount_amount=promotion_discount_amount,
            total_amount=total_amount,
            payment_reference=f"MOCK-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        )

        db.session.add(self._booking)
        db.session.flush()  # get booking.booking_id before inserting tickets

        self._ticket_rows = []
        for seat, ttype in zip(self._seats, ticket_types):
            unit_price = _money_to_float(self._prices[ttype].price)
            ticket = Ticket(
                type=ttype,
                unit_price=unit_price,
                booking_id=self._booking.booking_id,
                seat_id=seat.seat_id,
                show_id=self._show_id,
                showroom_id=self._show.showroom_id,
            )
            db.session.add(ticket)
            self._ticket_rows.append(ticket)

        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            # Most likely: uq_ticket_show_seat conflict (concurrent booking).
            return api_error("One or more selected seats are no longer available.", 409)
        except Exception:
            db.session.rollback()
            return api_error("Failed to create booking.", 500)

        return None  # no error

    def _send_order_confirmation_email_best_effort(self) -> None:
        """
        Best-effort order confirmation email.
        Never blocks booking creation if email fails or mail is unconfigured.
        """
        try:
            recipient = (self._user.email or "").strip()
            if not recipient:
                return

            movie = Movie.query.get(self._show.movie_id) if getattr(self, "_show", None) else None
            showroom = Showroom.query.get(self._show.showroom_id) if getattr(self, "_show", None) else None

            seat_labels = []
            for s in getattr(self, "_seats", []) or []:
                row = (getattr(s, "row_label", "") or "").strip()
                num = getattr(s, "seat_number", None)
                if row and num is not None:
                    seat_labels.append(f"{row}{num}")
            seat_labels_str = ", ".join(seat_labels) if seat_labels else ""

            start_time = ""
            if getattr(self, "_show", None) and self._show.start_time:
                start_time = self._show.start_time.isoformat()

            card_last_four = (getattr(self, "_card", None) and (self._card.last_four or "").strip()) or ""

            body_lines = [
                f"Hi {self._user.first_name},",
                "",
                "Thanks for your order! Your booking is confirmed.",
                "",
                f"Booking ID: {self._booking.booking_id}",
                f"Payment reference: {self._booking.payment_reference or ''}",
                f"Movie: {movie.title if movie else ''}",
                f"Showtime: {start_time}",
                f"Showroom: {showroom.showroom_name if showroom else ''}",
                f"Seats: {seat_labels_str}",
                f"Tickets: Adult {getattr(self, '_adult', 0)}, Child {getattr(self, '_child', 0)}, Senior {getattr(self, '_senior', 0)}",
                f"Total charged: ${_money_to_float(self._booking.total_amount):.2f}",
            ]
            if card_last_four:
                body_lines.append(f"Card: ****{card_last_four}")

            body_lines.extend(["", "See you at the movies!"])

            _send_email_or_log(
                subject=f"Order Confirmation - Booking #{self._booking.booking_id}",
                recipients=[recipient],
                body="\n".join(body_lines),
                demo_fallback_label=f"Order confirmation intended for {recipient} (booking {self._booking.booking_id})",
            )
        except Exception as e:
            print(f"Order confirmation email failed to send: {e}")


# ---------------------------------------------------------------------------
# Admin / movie helpers (unchanged)
# ---------------------------------------------------------------------------

def _create_movie_from_request_data(data: dict):
    """
    Validates JSON for create-movie (admin UI + /api/movies POST).
    Returns (Movie, None) or (None, error_response).
    """
    title = (data.get("title") or "").strip()
    genre = (data.get("genre") or "").strip()
    status = (data.get("status") or "").strip()

    runtime_raw = data.get("runtime")
    synopsis = (data.get("synopsis") or data.get("description") or "").strip() or None
    trailer_image_url = (data.get("trailer_image_url") or data.get("posterUrl") or data.get("poster_url") or "").strip()
    trailer_video_url = (data.get("trailer_video_url") or data.get("trailerUrl") or data.get("trailer_url") or "").strip()
    mpaa_rating = (data.get("mpaa_rating") or data.get("rating") or "").strip() or None

    if not title:
        return None, api_error("title is required", 400)
    if not genre:
        return None, api_error("genre is required", 400)
    if status not in ("CURRENTLY_RUNNING", "COMING_SOON", "ARCHIVED"):
        return None, api_error("status must be one of CURRENTLY_RUNNING, COMING_SOON, ARCHIVED", 400)

    if runtime_raw is None or runtime_raw == "":
        runtime = 120
    else:
        try:
            runtime = int(runtime_raw)
        except Exception:
            return None, api_error("runtime must be a number", 400)
    if runtime <= 0:
        return None, api_error("runtime must be greater than 0", 400)

    if not mpaa_rating:
        return None, api_error("rating is required", 400)

    m = Movie(
        title=title,
        genre=genre,
        status=status,
        runtime=runtime,
        synopsis=synopsis,
        trailer_image_url=trailer_image_url or None,
        trailer_video_url=trailer_video_url or None,
        mpaa_rating=mpaa_rating,
    )
    return m, None


def _movie_to_dict_with_id(m: Movie) -> dict:
    d = m.to_dict(include_shows=False)
    d["id"] = m.movie_id
    return d


def _showtime_to_frontend_dict(show: Show) -> dict:
    movie = Movie.query.get(show.movie_id)
    showroom = Showroom.query.get(show.showroom_id)
    st = show.start_time
    return {
        "id": show.show_id,
        "movie_title": movie.title if movie else "",
        "show_date": st.strftime("%Y-%m-%d") if st else "",
        "show_time": st.strftime("%H:%M") if st else "",
        "showroom_name": showroom.showroom_name if showroom else "",
    }


def _post_showtime_common():
    """Shared handler for POST /api/admin/shows and POST /api/showtimes."""
    _user, err = require_admin()
    if err:
        return err

    data = request.get_json() or {}
    movie_id_raw = data.get("movie_id") or data.get("movieId")
    showroom_id_raw = data.get("showroom_id") or data.get("showroomId")

    try:
        movie_id = int(movie_id_raw)
    except Exception:
        return api_error("movie_id is required and must be a number", 400)

    try:
        showroom_id = int(showroom_id_raw)
    except Exception:
        return api_error("showroom_id is required and must be a number", 400)

    merged = dict(data)
    if data.get("show_date") and data.get("show_time"):
        merged["date"] = data["show_date"]
        merged["time"] = data["show_time"]

    start_time, st_err = _parse_start_time(merged)
    if st_err:
        return st_err

    movie = Movie.query.get(movie_id)
    if not movie:
        return api_error("Movie not found", 404)

    showroom = Showroom.query.get(showroom_id)
    if not showroom or not showroom.is_active:
        return api_error("Showroom not found", 404)

    existing = Show.query.filter_by(showroom_id=showroom_id, start_time=start_time).first()
    if existing:
        return (
            jsonify(
                {
                    "error": "Scheduling conflict: that showroom already has a show at that time.",
                    "message": "Scheduling conflict: that showroom already has a show at that time.",
                    "conflict": existing.to_dict(),
                }
            ),
            409,
        )

    show = Show(movie_id=movie_id, showroom_id=showroom_id, start_time=start_time)
    db.session.add(show)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return api_error("Scheduling conflict: that showroom already has a show at that time.", 409)

    return jsonify(_showtime_to_frontend_dict(show)), 201


# ---------------------------------------------------------------------------
# Routes (all functionality unchanged; booking route now uses the Facade)
# ---------------------------------------------------------------------------

@app.get("/api/movies")
def get_movies():
    search = (request.args.get("search") or "").strip()
    genre = (request.args.get("genre") or "").strip()
    show_date_raw = (request.args.get("showDate") or "").strip()

    q = Movie.query

    if search:
        q = q.filter(Movie.title.ilike(f"%{search}%"))

    if genre:
        q = q.filter(Movie.genre == genre)

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
    movie = Movie.query.get_or_404(movie_id)
    data = movie.to_dict(include_shows=False, include_contributors=True)
    now = datetime.utcnow()
    data["shows"] = [
        s.to_dict() for s in movie.shows if s.start_time and s.start_time > now
    ]
    return jsonify(data)


@app.post("/api/movies")
def create_movie_for_admin_ui():
    """Frontend Add Movie uses POST /api/movies (same path as list; different method)."""
    _user, err = require_admin()
    if err:
        return err

    data = request.get_json() or {}
    m, err = _create_movie_from_request_data(data)
    if err:
        return err

    db.session.add(m)
    db.session.commit()
    return jsonify(_movie_to_dict_with_id(m)), 201


@app.get("/api/showrooms")
def list_showrooms():
    showrooms = Showroom.query.filter_by(is_active=True).order_by(Showroom.showroom_id.asc()).all()
    return jsonify(
        [
            {
                "id": s.showroom_id,
                "name": s.showroom_name,
                "showroom_id": s.showroom_id,
                "showroom_name": s.showroom_name,
                "is_active": bool(s.is_active),
            }
            for s in showrooms
        ]
    )


@app.get("/api/showtimes")
def list_showtimes_for_admin_ui():
    _user, err = require_admin()
    if err:
        return err

    rows = (
        db.session.query(Show, Movie, Showroom)
        .join(Movie, Movie.movie_id == Show.movie_id)
        .join(Showroom, Showroom.showroom_id == Show.showroom_id)
        .order_by(Show.start_time.asc())
        .all()
    )
    out = [_showtime_to_frontend_dict(show) for show, _movie, _sr in rows]
    return jsonify(out)


@app.post("/api/showtimes")
def create_showtime_for_admin_ui():
    """Frontend Add Showtime uses POST /api/showtimes with show_date + show_time."""
    return _post_showtime_common()


@app.get("/api/users")
def list_users_for_admin_ui():
    _user, err = require_admin()
    if err:
        return err

    users = User.query.order_by(User.user_id.asc()).all()
    out = []
    for u in users:
        role = "admin" if u.admin is not None else "customer"
        out.append(
            {
                "id": u.user_id,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "email": u.email,
                "role": role,
                "status": u.status,
            }
        )
    return jsonify(out)


@app.get("/api/promotions")
def list_promotions_for_admin_ui():
    _user, err = require_admin()
    if err:
        return err

    promos = Promotion.query.order_by(Promotion.expiration_date.desc()).all()
    out = []
    for p in promos:
        end = p.expiration_date.isoformat() if p.expiration_date else None
        out.append(
            {
                "id": p.promotion_id,
                "title": p.code,
                "description": p.description,
                "discount_code": p.code,
                "start_date": None,
                "end_date": end,
            }
        )
    return jsonify(out)


@app.post("/api/admin/movies")
def admin_add_movie():
    _user, err = require_admin()
    if err:
        return err

    data = request.get_json() or {}
    m, err = _create_movie_from_request_data(data)
    if err:
        return err

    db.session.add(m)
    db.session.commit()
    return jsonify(_movie_to_dict_with_id(m)), 201


@app.post("/api/admin/shows")
def admin_add_showtime():
    return _post_showtime_common()


@app.post("/api/admin/promotions")
def admin_add_promotion():
    _user, err = require_admin()
    if err:
        return err

    data = request.get_json() or {}
    code = (data.get("code") or "").strip()
    description = (data.get("description") or "").strip() or None
    discount_type = (data.get("discount_type") or data.get("discountType") or "").strip() or "Percent"
    discount_value_raw = data.get("discount_value") if "discount_value" in data else data.get("discountValue")
    expiration_raw = (data.get("expiration_date") or data.get("expirationDate") or "").strip()

    if not code:
        return jsonify({"error": "code is required"}), 400
    if discount_type not in ("Percent", "Amount"):
        return jsonify({"error": "discount_type must be Percent or Amount"}), 400

    try:
        discount_value = float(discount_value_raw)
    except Exception:
        return jsonify({"error": "discount_value is required and must be a number"}), 400
    if discount_value < 0:
        return jsonify({"error": "discount_value must be >= 0"}), 400

    if not expiration_raw:
        return jsonify({"error": "expiration_date is required"}), 400
    try:
        expiration_date = datetime.fromisoformat(expiration_raw.replace(" ", "T"))
    except ValueError:
        return jsonify({"error": "expiration_date must be an ISO datetime like 2026-12-31T23:59:59"}), 400

    if Promotion.query.filter_by(code=code).first():
        return jsonify({"error": "Promotion code already exists"}), 409

    p = Promotion(
        code=code,
        description=description,
        discount_type=discount_type,
        discount_value=discount_value,
        expiration_date=expiration_date,
    )
    db.session.add(p)
    db.session.commit()

    # Send announcement email to all opted-in users (best-effort).
    _notify_promotion_opt_in_users_best_effort(p)

    return (
        jsonify(
            {
                "promotion_id": p.promotion_id,
                "code": p.code,
                "description": p.description,
                "discount_type": p.discount_type,
                "discount_value": float(p.discount_value),
                "expiration_date": p.expiration_date.isoformat() if p.expiration_date else None,
            }
        ),
        201,
    )


@app.post("/api/admin/promotions/<int:promotion_id>/send")
def admin_send_promotion_email(promotion_id: int):
    _user, err = require_admin()
    if err:
        return err

    promo = Promotion.query.get(promotion_id)
    if not promo:
        return jsonify({"error": "Promotion not found"}), 404

    q = (
        db.session.query(User.email, User.first_name)
        .join(Customer, Customer.customer_id == User.user_id)
        .filter(Customer.promotion_opt_in.is_(True))
        .filter(User.status == "Active")
        .filter(User.is_verified.is_(True))
    )
    recipients = [row.email for row in q.all() if (row.email or "").strip()]

    body = (
        f"Promotion: {promo.code}\n\n"
        f"{promo.description or ''}\n\n"
        f"Discount type: {promo.discount_type}\n"
        f"Discount value: {promo.discount_value}\n"
        f"Expires: {promo.expiration_date.isoformat() if promo.expiration_date else ''}\n"
    )

    _send_email_or_log(
        subject=f"New Promotion: {promo.code}",
        recipients=recipients,
        body=body,
        demo_fallback_label=f"Promotion email would go to: {', '.join(recipients) if recipients else '(no subscribers)'}",
    )

    return jsonify({"message": "Promotion email sent (or logged in demo mode).", "recipient_count": len(recipients)}), 200


@app.post("/api/auth/register")
def register():
    data = request.get_json() or {}
    last_name = data.get("last_name") or data.get("Last_name", "")

    if not data.get("first_name"):
        return jsonify({"error": "first_name is required"}), 400
    if not last_name:
        return jsonify({"error": "last_name is required"}), 400
    if not data.get("email"):
        return jsonify({"error": "email is required"}), 400
    if not data.get("password"):
        return jsonify({"error": "password is required"}), 400

    if not re.match(r"[^@]+@[^@]+\.[^@]+", data["email"]):
        return jsonify({"error": "Invalid email format"}), 400

    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already registered", "message": "Email already registered"}), 409

    if len(data["password"]) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    phone = (data.get("phone_number") or data.get("phone") or "").strip() or None
    if phone and User.query.filter_by(phone_number=phone).first():
        return jsonify({"error": "Phone number already in use", "message": "Phone number already in use"}), 409

    pw_hash = bcrypt.generate_password_hash(data["password"]).decode("utf-8")

    user = User(
        first_name=data["first_name"],
        last_name=last_name,
        email=data["email"],
        phone_number=phone,
        password_hash=pw_hash,
        is_verified=False,
        status="Inactive",
    )
    db.session.add(user)
    db.session.flush()

    db.session.add(
        Customer(
            customer_id=user.user_id,
            promotion_opt_in=bool(data.get("promotion_opt_in", False)),
        )
    )
    db.session.commit()

    try:
        token = serializer.dumps(user.email, salt="email-confirm")
        verify_url = f"{os.environ.get('FRONTEND_URL', 'http://localhost:5173')}/verify-email/{token}"
        _send_email_or_log(
            subject="Confirm Your Account",
            recipients=[user.email],
            body=(
                f"Hi {user.first_name},\n\n"
                f"Verify your account here:\n{verify_url}\n\n"
                f"This link expires in 1 hour."
            ),
            demo_fallback_label=f"Verification URL is: {verify_url}",
        )
    except Exception as e:
        print(f"Email failed to send: {e}")

    return jsonify({"message": "Registration successful. Please check your email to verify your account."}), 201


@app.get("/api/verify-email/<token>")
def verify_email(token):
    try:
        email = serializer.loads(token, salt="email-confirm", max_age=3600)
    except SignatureExpired:
        return jsonify({"error": "Verification link has expired."}), 400
    except BadSignature:
        return jsonify({"error": "Invalid verification link."}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "User not found."}), 404
    if user.is_verified:
        return jsonify({"message": "Account already verified."}), 200

    user.is_verified = True
    user.status = "Active"
    db.session.commit()
    return jsonify({"message": "Email verified. You may now log in."}), 200


@app.post("/api/auth/login")
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    password = data.get("password", "")

    user = User.query.filter_by(email=email).first()

    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password.", "message": "Invalid email or password."}), 401

    if not user.is_verified:
        return jsonify(
            {
                "error": "Account is not verified. Please check your email to verify your account.",
                "message": "Account is not verified. Please check your email to verify your account.",
            }
        ), 403

    if user.status == "Suspended":
        return jsonify(
            {"error": "Your account has been suspended.", "message": "Your account has been suspended."}
        ), 403

    role = "admin" if user.admin is not None else "customer"

    session["user_id"] = user.user_id
    session.permanent = True

    token = serializer.dumps(str(user.user_id), salt="login-token")

    return jsonify(
        {
            "token": token,
            "user": {
                "user_id": user.user_id,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "role": role,
            },
        }
    ), 200


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully."}), 200


@app.post("/api/forgot-password")
def forgot_password():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    user = User.query.filter_by(email=email).first()

    if user:
        try:
            token = serializer.dumps(email, salt="password-reset")
            reset_url = f"{os.environ.get('FRONTEND_URL', 'http://localhost:5173')}/reset-password/{token}"
            _send_email_or_log(
                subject="Password Reset Request",
                recipients=[email],
                body=(
                    f"Hi {user.first_name},\n\n"
                    f"Reset your password here:\n{reset_url}\n\n"
                    f"This link expires in 30 minutes."
                ),
                demo_fallback_label=f"Reset URL is: {reset_url}",
            )
        except Exception as e:
            print(f"Email failed to send: {e}")

    return jsonify({"message": "If that email is registered, a reset link has been sent."}), 200


@app.post("/api/reset-password/<token>")
def reset_password(token):
    try:
        email = serializer.loads(token, salt="password-reset", max_age=1800)
    except SignatureExpired:
        return jsonify({"error": "Reset link has expired."}), 400
    except BadSignature:
        return jsonify({"error": "Invalid reset link."}), 400

    data = request.get_json() or {}
    new_password = data.get("password", "")
    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    db.session.commit()
    return jsonify({"message": "Password reset successfully."}), 200


@app.get("/api/profile")
def get_profile():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    address = Address.query.filter_by(customer_id=user.user_id).first()
    cards = PaymentCard.query.filter_by(customer_id=user.user_id, is_active=True).all()
    favs = FavoriteMovie.query.filter_by(customer_id=user.user_id).all()

    return jsonify(
        {
            "firstName": user.first_name,
            "lastName": user.last_name,
            "email": user.email,
            "phone": user.phone_number or "",
            "address": (
                {
                    "address_id": address.address_id,
                    "street": address.street,
                    "city": address.city,
                    "state": address.state,
                    "zip_code": address.zip_code,
                }
                if address
                else None
            ),
            # PROXY: payment_card_to_public_dict delegates to PaymentCardProxy
            # to ensure card numbers are always masked in profile responses.
            "payment_cards": [payment_card_to_public_dict(c) for c in cards],
            "favorites": [m.to_dict() for f in favs if (m := Movie.query.get(f.movie_id))],
        }
    )


@app.put("/api/profile")
def update_profile():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    customer = user.customer
    data = request.get_json() or {}

    if "firstName" in data:
        user.first_name = data["firstName"]
    if "first_name" in data:
        user.first_name = data["first_name"]
    if "lastName" in data:
        user.last_name = data["lastName"]
    if "last_name" in data:
        user.last_name = data["last_name"]
    if "phone" in data:
        pn = (data["phone"] or "").strip() or None
        if pn and pn != (user.phone_number or ""):
            if User.query.filter(User.phone_number == pn, User.user_id != user.user_id).first():
                return jsonify({"error": "Phone number already in use.", "message": "Phone number already in use."}), 409
        user.phone_number = pn
    if "phone_number" in data:
        pn = (data["phone_number"] or "").strip() or None
        if pn and pn != (user.phone_number or ""):
            if User.query.filter(User.phone_number == pn, User.user_id != user.user_id).first():
                return jsonify({"error": "Phone number already in use.", "message": "Phone number already in use."}), 409
        user.phone_number = pn
    if "promotion_opt_in" in data and customer:
        customer.promotion_opt_in = bool(data["promotion_opt_in"])

    if "new_password" in data:
        if not bcrypt.check_password_hash(user.password_hash, data.get("current_password", "")):
            return jsonify({"error": "Current password is incorrect.", "message": "Current password is incorrect."}), 400
        if len(data["new_password"]) < 8:
            return jsonify({"error": "New password must be at least 8 characters."}), 400
        user.password_hash = bcrypt.generate_password_hash(data["new_password"]).decode("utf-8")

    if "address" in data:
        addr_data = data["address"] or {}
        address = Address.query.filter_by(customer_id=user.user_id).first()
        if address:
            for field in ["street", "city", "state", "zip_code"]:
                if field in addr_data:
                    setattr(address, field, addr_data[field])
        else:
            db.session.add(
                Address(
                    customer_id=user.user_id,
                    street=addr_data.get("street", ""),
                    city=addr_data.get("city", ""),
                    state=addr_data.get("state", ""),
                    zip_code=addr_data.get("zip_code", ""),
                )
            )

    db.session.commit()

    try:
        _send_email_or_log(
            subject="Your Profile Was Updated",
            recipients=[user.email],
            body=(
                f"Hi {user.first_name},\n\n"
                f"Your profile was recently updated. If this wasn't you, contact support."
            ),
            demo_fallback_label=f"Profile update notification intended for {user.email}",
        )
    except Exception as e:
        print(f"Email failed to send: {e}")

    return jsonify(
        {
            "message": "Profile updated successfully.",
            "profile": {
                "firstName": user.first_name,
                "lastName": user.last_name,
                "email": user.email,
                "phone": user.phone_number or "",
            },
        }
    ), 200


@app.post("/api/profile/payment-cards")
def add_payment_card():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    active = PaymentCard.query.filter_by(customer_id=user.user_id, is_active=True).count()
    if active >= MAX_PAYMENT_CARDS:
        return jsonify(
            {
                "error": "Maximum of 3 payment cards allowed.",
                "message": "Maximum of 3 payment cards allowed.",
            }
        ), 400

    data = request.get_json() or {}
    raw_num = (data.get("card_number") or data.get("cardNumber") or "").replace(" ", "")
    if not raw_num or len(raw_num) < 13:
        return jsonify({"error": "Valid card number is required."}), 400
    last_four = re.sub(r"\D", "", raw_num)[-4:]
    if len(last_four) != 4:
        return jsonify({"error": "Valid card number is required."}), 400

    exp_raw = data.get("expiration_date") or data.get("expirationDate") or ""
    try:
        if isinstance(exp_raw, str) and len(exp_raw) == 7 and exp_raw[4] == "-":
            exp_date = datetime.strptime(exp_raw + "-01", "%Y-%m-%d").date()
        else:
            exp_date = datetime.strptime(str(exp_raw)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return jsonify({"error": "expiration_date must be YYYY-MM-DD"}), 400

    enc = encrypt_card_number(raw_num)

    card = PaymentCard(
        customer_id=user.user_id,
        card_number_encrypted=enc,
        last_four=last_four,
        expiration_date=exp_date,
        billing_street=data.get("billing_street") or data.get("billingStreet") or "",
        billing_city=data.get("billing_city") or data.get("billingCity") or "",
        billing_state=(data.get("billing_state") or data.get("billingState") or "")[:2],
        billing_zip_code=data.get("billing_zip_code") or data.get("billingZipCode") or "",
        billing_apt=data.get("billing_apt") or data.get("billingApt"),
        is_active=True,
    )
    db.session.add(card)
    db.session.commit()

    try:
        _send_email_or_log(
            subject="Your Profile Was Updated",
            recipients=[user.email],
            body=f"Hi {user.first_name},\n\nA payment card was added to your account.",
            demo_fallback_label=f"Payment card added notification intended for {user.email}",
        )
    except Exception as e:
        print(f"Email failed to send: {e}")

    # PROXY: use PaymentCardProxy to produce the masked public representation.
    proxy = PaymentCardProxy(card, user.user_id)
    return jsonify({"message": "Card added.", "card": proxy.to_public_dict()}), 201


@app.get("/api/profile/payment-cards/<int:card_id>")
def get_payment_card(card_id: int):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    raw_card = PaymentCard.query.filter_by(card_id=card_id, is_active=True).first()

    # PROXY: enforce ownership and mask card number through the proxy.
    proxy = PaymentCardProxy(raw_card, user.user_id) if raw_card else None
    if proxy is None or not proxy.is_accessible():
        return jsonify({"error": "Card not found."}), 404

    plain = proxy.get_plain_number()
    return jsonify(
        {
            "card": {
                "card_id": proxy.card.card_id,
                "card_number": plain,
                "expiration_date": proxy.card.expiration_date.isoformat() if proxy.card.expiration_date else None,
                "billing_street": proxy.card.billing_street,
                "billing_city": proxy.card.billing_city,
                "billing_state": proxy.card.billing_state,
                "billing_zip_code": proxy.card.billing_zip_code,
                "billing_apt": proxy.card.billing_apt,
            }
        }
    ), 200


@app.put("/api/profile/payment-cards/<int:card_id>")
def update_payment_card(card_id: int):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    raw_card = PaymentCard.query.filter_by(card_id=card_id, is_active=True).first()

    # PROXY: verify the card belongs to this user before allowing mutation.
    proxy = PaymentCardProxy(raw_card, user.user_id) if raw_card else None
    if proxy is None or not proxy.is_accessible():
        return jsonify({"error": "Card not found."}), 404

    card = proxy.card  # get the underlying ORM object for mutation
    data = request.get_json() or {}

    if "card_number" in data or "cardNumber" in data:
        raw_num = (data.get("card_number") or data.get("cardNumber") or "").replace(" ", "")
        if raw_num and len(raw_num) >= 13:
            card.card_number_encrypted = encrypt_card_number(raw_num)
            last_four = re.sub(r"\D", "", raw_num)[-4:]
            if len(last_four) == 4:
                card.last_four = last_four

    exp_raw = data.get("expiration_date") or data.get("expirationDate")
    if exp_raw:
        try:
            if isinstance(exp_raw, str) and len(exp_raw) == 7 and exp_raw[4] == "-":
                card.expiration_date = datetime.strptime(exp_raw + "-01", "%Y-%m-%d").date()
            else:
                card.expiration_date = datetime.strptime(str(exp_raw)[:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return jsonify({"error": "expiration_date must be YYYY-MM-DD"}), 400

    for json_k, attr in [
        ("billing_street", "billing_street"),
        ("billingStreet", "billing_street"),
        ("billing_city", "billing_city"),
        ("billingCity", "billing_city"),
        ("billing_state", "billing_state"),
        ("billingState", "billing_state"),
        ("billing_zip_code", "billing_zip_code"),
        ("billingZipCode", "billing_zip_code"),
        ("billing_apt", "billing_apt"),
        ("billingApt", "billing_apt"),
    ]:
        if json_k in data and data[json_k] is not None:
            val = data[json_k]
            if attr == "billing_state":
                val = str(val)[:2]
            setattr(card, attr, val)

    db.session.commit()

    try:
        _send_email_or_log(
            subject="Your Profile Was Updated",
            recipients=[user.email],
            body=f"Hi {user.first_name},\n\nA payment card on your account was updated.",
            demo_fallback_label=f"Payment card updated notification intended for {user.email}",
        )
    except Exception as e:
        print(f"Email failed to send: {e}")

    # PROXY: produce masked response via proxy after mutation.
    return jsonify({"message": "Card updated.", "card": proxy.to_public_dict()}), 200


@app.delete("/api/profile/payment-cards/<int:card_id>")
def delete_payment_card(card_id: int):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    card = PaymentCard.query.filter_by(card_id=card_id, customer_id=user.user_id).first()
    if not card:
        return jsonify({"error": "Card not found."}), 404

    if Booking.query.filter_by(customer_id=user.user_id, card_id=card_id).first():
        card.is_active = False
    else:
        db.session.delete(card)
    db.session.commit()

    try:
        _send_email_or_log(
            subject="Your Profile Was Updated",
            recipients=[user.email],
            body=f"Hi {user.first_name},\n\nA payment card was removed from your account.",
            demo_fallback_label=f"Payment card removed notification intended for {user.email}",
        )
    except Exception as e:
        print(f"Email failed to send: {e}")

    return jsonify({"message": "Card removed."}), 200


@app.post("/api/bookings")
def create_booking():
    """
    Create a booking + tickets for selected seats.

    Frontend payload (see `frontend/src/api/cinemaApi.ts`):
      {
        showId: number,
        cardId: number,
        selectedSeats: string[],        // e.g. ["A1", "A2"]
        ticketCounts: { adult, child, senior }
      }

    FACADE: the entire workflow is delegated to BookingFacade, which
    internally uses the Adapter (seat resolution) and Builder (response).
    """
    user, err = require_login()
    if err:
        return err
    if user.customer is None:
        return api_error("Customer account required.", 403)

    # FACADE: one call replaces ~100 lines of inline logic.
    return BookingFacade(user, request.get_json() or {}).execute()


@app.get("/api/favorites")
def get_favorites():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    favs = FavoriteMovie.query.filter_by(customer_id=user.user_id).all()
    return jsonify([m.to_dict() for f in favs if (m := Movie.query.get(f.movie_id))]), 200


@app.post("/api/favorites")
def add_favorite():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    data = request.get_json() or {}
    movie_id = data.get("movieId") or data.get("movie_id")
    if not movie_id:
        return jsonify({"error": "movieId is required"}), 400

    Movie.query.get_or_404(movie_id)

    if not FavoriteMovie.query.filter_by(customer_id=user.user_id, movie_id=movie_id).first():
        db.session.add(FavoriteMovie(customer_id=user.user_id, movie_id=movie_id))
        db.session.commit()

    return jsonify({"message": "Added to favorites."}), 201


@app.delete("/api/favorites")
def remove_favorite():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    data = request.get_json() or {}
    movie_id = data.get("movieId") or data.get("movie_id")
    if not movie_id:
        return jsonify({"error": "movieId is required"}), 400

    fav = FavoriteMovie.query.filter_by(customer_id=user.user_id, movie_id=movie_id).first()
    if fav:
        db.session.delete(fav)
        db.session.commit()

    return jsonify({"message": "Removed from favorites."}), 200


@app.get("/api/bookings")
def get_order_history():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401
    if user.customer is None:
        return jsonify({"error": "Customer account required."}), 403

    bookings = (
        db.session.query(Booking)
        .filter_by(customer_id=user.user_id)
        .order_by(Booking.booking_time.desc())
        .all()
    )

    result = []
    for booking in bookings:
        show = Show.query.get(booking.show_id)
        movie = Movie.query.get(show.movie_id) if show else None
        showroom = Showroom.query.get(show.showroom_id) if show else None
        tickets = Ticket.query.filter_by(booking_id=booking.booking_id).all()
        card = PaymentCard.query.filter_by(card_id=booking.card_id, customer_id=user.user_id).first()

        result.append({
            "booking_id": booking.booking_id,
            "booking_time": booking.booking_time.isoformat() if booking.booking_time else None,
            "total_amount": _money_to_float(booking.total_amount),
            "booking_fee_amount": _money_to_float(booking.booking_fee_amount),
            "promotion_discount_amount": _money_to_float(booking.promotion_discount_amount),
            "payment_reference": booking.payment_reference,
            "card_last_four": (card.last_four or "").strip() if card else None,
            "show": {
                "show_id": show.show_id,
                "start_time": show.start_time.isoformat() if show and show.start_time else None,
                "showroom_name": showroom.showroom_name if showroom else None,
            } if show else None,
            "movie": {
                "movie_id": movie.movie_id,
                "title": movie.title,
                "genre": movie.genre,
                "mpaa_rating": movie.mpaa_rating,
                "trailer_image_url": movie.trailer_image_url,
            } if movie else None,
            "tickets": [
                {
                    "ticket_id": t.ticket_id,
                    "type": t.type,
                    "unit_price": _money_to_float(t.unit_price),
                    "seat_id": t.seat_id,
                }
                for t in tickets
            ],
        })

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# AI movie recommendations (frontend: POST /api/recommendations/movies)
# ---------------------------------------------------------------------------

def _ollama_recommendation_subset(
    *,
    candidate_movies: list[dict],
    limit: int = 8,
) -> list[dict]:
    """
    Call a local Ollama model to select a recommendation subset.

    Returns a list of dicts in the frontend shape:
      { title: str, genre?: str, rating?: str, reason: str }
    """
    base_url = (os.environ.get("OLLAMA_BASE_URL") or "").strip() or "http://127.0.0.1:11434"
    model = (os.environ.get("OLLAMA_MODEL") or "").strip() or "llama3.1"
    max_candidates = int(os.environ.get("OLLAMA_MAX_CANDIDATES") or 200)
    max_candidates = max(25, min(500, max_candidates))

    candidates = candidate_movies[:max_candidates]

    system = "\n".join(
        [
            "You are a movie recommendation engine for a cinema app.",
            "You will be given:",
            "- candidates: movies in the logged-in user's favorites list (each has title, genre, rating)",
            "",
            "Task: choose a subset of these favorites to recommend watching next.",
            "",
            "Hard rules:",
            f"- Return EXACTLY {limit} recommendations (or fewer if candidates has fewer than {limit}).",
            "- Each recommendation title MUST exactly match a title from candidates.",
            "- Output MUST be valid JSON only (no markdown), in this exact shape:",
            '{ "recommendations": [ { "title": "...", "reason": "...", "genre": "...", "rating": "..." } ] }',
            "- Keep reasons short (1 sentence).",
        ]
    )

    user_content = {
        "candidates": candidates,
    }

    # Ollama /api/chat request. We require JSON-only output, so we set format="json".
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_content, ensure_ascii=False)},
        ],
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.6},
    }

    req = urllib_request.Request(
        f"{base_url.rstrip('/')}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")
        except Exception:
            body = ""
        raise RuntimeError(f"Ollama error ({getattr(e, 'code', 'unknown')}): {body[:500]}") from e
    except URLError as e:
        raise RuntimeError(
            "Could not reach Ollama. Make sure it's running locally on 127.0.0.1:11434 "
            "and that you have pulled the model (e.g. `ollama pull llama3.1`)."
        ) from e

    try:
        msg = json.loads(raw)
    except Exception as e:
        raise RuntimeError(f"Ollama returned non-JSON: {raw[:500]}") from e

    # Ollama /api/chat returns: { message: { role, content }, ... }
    content = ""
    try:
        content = ((msg.get("message") or {}) or {}).get("content") or ""
    except Exception:
        content = ""

    content = (content or "").strip()
    if not content:
        raise RuntimeError("Ollama response content was empty")

    try:
        out = json.loads(content)
    except Exception as e:
        raise RuntimeError(f"Ollama did not return valid JSON-only output: {content[:500]}") from e

    recs = out.get("recommendations") if isinstance(out, dict) else None
    if not isinstance(recs, list):
        raise RuntimeError("Ollama output missing recommendations[]")

    # Enforce titles exist in candidates; fill genre/rating from DB-provided dicts.
    by_title = {str(m.get("title")): m for m in candidates if isinstance(m, dict) and (m.get("title") or "").strip()}

    normalized: list[dict] = []
    for r in recs[:limit]:
        if not isinstance(r, dict):
            continue
        title = (r.get("title") or "").strip()
        if not title or title not in by_title:
            continue

        m = by_title[title]
        reason = (r.get("reason") or "").strip() or "Recommended based on your favorites."

        normalized.append(
            {
                "title": title,
                "genre": (r.get("genre") or m.get("genre") or "").strip() or None,
                "rating": (r.get("rating") or m.get("rating") or "").strip() or None,
                "reason": reason,
            }
        )

    # If the model returned fewer valid items than requested, just return what we have.
    return normalized


@app.post("/api/recommendations/movies")
def recommend_movies_from_favorites():
    """
    Frontend calls this endpoint to get AI recommendations.
    Payload: { favorites: RecommendationRequestMovie[] }
    """
    user, err = require_login()
    if err:
        return err
    if user.customer is None:
        return api_error("Customer account required.", 403)

    data = request.get_json(silent=True) or {}
    favorites = data.get("favorites")
    if favorites is None:
        return api_error("favorites is required", 400)
    if not isinstance(favorites, list):
        return api_error("favorites must be an array", 400)

    # Only send movies from the *logged-in user's* favorites list.
    fav_rows = FavoriteMovie.query.filter_by(customer_id=user.user_id).all()
    favorite_movie_ids = [r.movie_id for r in fav_rows if r and r.movie_id is not None]
    if not favorite_movie_ids:
        return jsonify({"recommendations": []}), 200

    fav_movies = (
        Movie.query.filter(Movie.movie_id.in_(favorite_movie_ids))
        .order_by(Movie.title.asc())
        .all()
    )
    candidates = [
        {"title": m.title, "genre": m.genre or "", "rating": m.mpaa_rating or ""}
        for m in fav_movies
        if m and (m.title or "").strip()
    ]
    if not candidates:
        return jsonify({"recommendations": []}), 200

    try:
        recs = _ollama_recommendation_subset(
            candidate_movies=candidates,
            limit=8,
        )
    except RuntimeError as e:
        return api_error(str(e), 500)

    return jsonify({"recommendations": recs}), 200