from flask import Flask, render_template
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint, Index

app = Flask(__name__)

app.config["SQLALCHEMY_DATABASE_URI"] = "mysql+pymysql://root@localhost/dawghouse_db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

class Movie(db.Model):
    __tablename__ = 'movie'
    movie_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(255), nullable=False)
    genre = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    synopsis = db.Column(db.Text)
    trailer_image_url = db.Column(db.String(255))
    trailer_video_url = db.Column(db.String(255))
    mpaa_rating = db.Column(db.String(10))
    
    __table_args__ = (
        Index('idx_movie_title', 'title'),
        Index('idx_movie_genre', 'genre'),
        Index('idx_movie_status', 'status'),
    )
    
    shows = db.relationship('Show', back_populates='movie', cascade='all, delete-orphan')

    def __repr__(self):
        return f"{self.movie_id}. {self.title}"

class Hall(db.Model):
    __tablename__ = 'hall'
    hall_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    hall_name = db.Column(db.String(50), nullable=False)
    
    shows = db.relationship('Show', back_populates='hall')

    def __repr__(self):
        return f"{self.hall_id}. {self.hall_name}"
    
class Show(db.Model):
    __tablename__ = 'show'
    show_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    movie_id = db.Column(db.Integer, db.ForeignKey('movie.movie_id', ondelete='CASCADE'), nullable=False)
    hall_id = db.Column(db.Integer, db.ForeignKey('hall.hall_id', ondelete='RESTRICT'), nullable=False)
    show_date = db.Column(db.Date, nullable=False)
    show_time = db.Column(db.Time, nullable=False)
    
    __table_args__ = (
        UniqueConstraint('hall_id', 'show_date', 'show_time', name='uq_show_hall_date_time'),
        Index('idx_show_movie', 'movie_id'),
        Index('idx_show_date', 'show_date'),
    )
    
    movie = db.relationship('Movie', back_populates='shows')
    hall = db.relationship('Hall', back_populates='shows')

    def __repr__(self):
        return f"{self.show_id}. {self.movie.title} at {self.show_time} on {self.show_date}"