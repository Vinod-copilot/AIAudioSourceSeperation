import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routes.api import router as api_router
from app.routes.downloads import router as downloads_router
from app.routes.auth import router as auth_router

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s"
)
logger = logging.getLogger("uvicorn")

# Initialize app
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API server for separating audio vocals and instrumental stems using Demucs and Modal.",
    version="1.0.0"
)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.info(f"Response: {request.method} {request.url.path} - Status: {response.status_code}")
        return response
    except Exception as e:
        logger.exception(f"Request failed: {request.method} {request.url.path} - Error: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"An unexpected server error occurred: {str(e)}"}
        )

# Healthcheck
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "project": settings.PROJECT_NAME}

# Register routers under /api
app.include_router(auth_router, prefix=settings.API_V1_STR, tags=["Authentication"])
app.include_router(api_router, prefix=settings.API_V1_STR, tags=["Separation API"])
app.include_router(downloads_router, prefix=settings.API_V1_STR, tags=["Download API"])
