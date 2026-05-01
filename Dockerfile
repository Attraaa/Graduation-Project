# 1. 가벼운 파이썬 3.11 버전을 가져온다
FROM python:3.11-slim

# 2. 컨테이너 안에서 작업할 기본 폴더를 /app으로 정한다
WORKDIR /app

# 3. 라이브러리 목록을 복사하고 설치한다
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. 내 폴더에 있는 모든 코드(main.py 등)를 컨테이너 안으로 복사한다
COPY . .

# 5. 서버를 8000번 포트에서 실행한다
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
