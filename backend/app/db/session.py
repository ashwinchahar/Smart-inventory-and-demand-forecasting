from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

Base = declarative_base()

# Dedicated PostgreSQL connection pool
engine = create_engine(
    settings.get_database_url(),
    pool_pre_ping=True,
    pool_size=15,
    max_overflow=25
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

