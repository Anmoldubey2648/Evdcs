"""Database setup, models, and connection management."""
import os
from datetime import datetime, timezone
from sqlalchemy import (
    create_engine, text, Column, String, Integer, Float,
    DateTime, UniqueConstraint, Index
)
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args={"connect_timeout": 10},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class WindActual(Base):
    __tablename__ = "wind_actual"
    id = Column(Integer, primary_key=True, autoincrement=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    settlement_date = Column(String(10), nullable=False)
    settlement_period = Column(Integer, nullable=False)
    generation_mw = Column(Float, nullable=False)
    publish_time = Column(DateTime(timezone=True))
    synced_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("start_time", name="uq_wind_actual_start"),
        Index("ix_wind_actual_start", "start_time"),
    )


class WindForecast(Base):
    __tablename__ = "wind_forecast"
    id = Column(Integer, primary_key=True, autoincrement=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    publish_time = Column(DateTime(timezone=True), nullable=False)
    generation_mw = Column(Float, nullable=False)
    synced_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("start_time", "publish_time", name="uq_wind_forecast_start_publish"),
        Index("ix_wind_forecast_start", "start_time"),
        Index("ix_wind_forecast_publish", "publish_time"),
    )


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
