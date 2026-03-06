from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio

app = FastAPI(title="MES Mock Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    id: str
    password: str

class PrintRequest(BaseModel):
    lot_no: str

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    # 로컬 테스트용 — 아무 값이나 통과
    return {"user": req.id}

@app.post("/api/print")
async def print_lot(req: PrintRequest):
    # 프린터 연결 전 mock a
    await asyncio.sleep(0.5)
    print(f"[MOCK] 인쇄 요청: LOT No = {req.lot_no}")
    return {"success": True, "lot_no": req.lot_no}   
#s