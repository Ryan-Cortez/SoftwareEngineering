"""
Flask backend for the cinema app.

Frontend expectations (see `frontend/src/api/cinemaApi.ts`):
- `GET /api/movies?search=&genre=&showDate=YYYY-MM-DD` returns a JSON array of movies
- `GET /api/movies/<id>` returns one movie (plus show info)

Important: the frontend can consume either snake_case (movie_id, synopsis, ...)
or camelCase equivalents; it normalizes both.
"""

import os
import re
from datetime import datetime

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


def get_current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    return User.query.get(uid)


def payment_card_to_public_dict(c: PaymentCard) -> dict:
    last4 = (c.last_four or "").strip()
    if last4 and len(last4) == 4:
        masked = "*" * 12 + last4
    else:
        plain = decrypt_card_number(c.card_number_encrypted)
        masked = mask_card_number(plain)
    return {
        "card_id": c.card_id,
        "card_number": masked,
        "expiration_date": c.expiration_date.isoformat() if c.expiration_date else None,
        "billing_street": c.billing_street,
        "billing_city": c.billing_city,
        "billing_state": c.billing_state,
        "billing_zip_code": c.billing_zip_code,
        "billing_apt": c.billing_apt,
    }


MAX_PAYMENT_CARDS = 3


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
    return jsonify(movie.to_dict(include_shows=True))


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

    return jsonify({"message": "Card added.", "card": payment_card_to_public_dict(card)}), 201


@app.get("/api/profile/payment-cards/<int:card_id>")
def get_payment_card(card_id: int):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    card = PaymentCard.query.filter_by(card_id=card_id, customer_id=user.user_id, is_active=True).first()
    if not card:
        return jsonify({"error": "Card not found."}), 404

    plain = decrypt_card_number(card.card_number_encrypted)
    return jsonify(
        {
            "card": {
                "card_id": card.card_id,
                "card_number": plain,
                "expiration_date": card.expiration_date.isoformat() if card.expiration_date else None,
                "billing_street": card.billing_street,
                "billing_city": card.billing_city,
                "billing_state": card.billing_state,
                "billing_zip_code": card.billing_zip_code,
                "billing_apt": card.billing_apt,
            }
        }
    ), 200


@app.put("/api/profile/payment-cards/<int:card_id>")
def update_payment_card(card_id: int):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in."}), 401

    card = PaymentCard.query.filter_by(card_id=card_id, customer_id=user.user_id, is_active=True).first()
    if not card:
        return jsonify({"error": "Card not found."}), 404

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

    return jsonify({"message": "Card updated.", "card": payment_card_to_public_dict(card)}), 200


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
