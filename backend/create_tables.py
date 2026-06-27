# create_tables.py — run this once
from app.database.db import engine, Base
from app.models import models

Base.metadata.create_all(bind=engine)
print("Tables created.")