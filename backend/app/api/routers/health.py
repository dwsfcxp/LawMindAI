from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "ok", "app": "LawMind AI", "version": "0.1.0"}
