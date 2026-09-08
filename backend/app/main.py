import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.api import auth, groups, brands, zones, categories, foods, prices, users, clone, public_menu, images, orders

app = FastAPI(
    title="Restaurant Multi-Brand Menu System API",
    description="Backend for a multi-group, multi-brand restaurant menu management system.",
    version="1.1.0",
)

# In production, replace "*" with your actual frontend origin(s).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount(settings.UPLOAD_URL_PREFIX, StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(brands.router)
app.include_router(zones.router)
app.include_router(categories.router)
app.include_router(foods.router)
app.include_router(prices.router)
app.include_router(users.router)
app.include_router(clone.router)
app.include_router(public_menu.router)
app.include_router(images.router)
app.include_router(orders.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
