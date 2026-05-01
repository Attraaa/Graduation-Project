from fastapi import FastAPI

app = FastAPI(title="자세 분석 API 서버")

# 1. 서버가 잘 떴는지 확인하는 기본 주소
@app.get("/")
def read_root():
    return {"message": "Hello, Electron! 서버가 도커 위에서 잘 돌아가고 있어."}

# 2. 나중에 앱에서 분석된 JSON 데이터를 던져줄 주소 (미리 뼈대만)
@app.post("/api/pose")
def receive_pose_data(data: dict):
    print("받은 데이터:", data)
    return {"status": "success", "message": "데이터 잘 받았음!"}