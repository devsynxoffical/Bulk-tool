FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libdbus-1-3 libexpat1 libxcb1 libxkbcommon0 libatspi2.0-0 libx11-6 \
      libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 \
      libpango-1.0-0 libcairo2 libasound2 libglib2.0-0 libfontconfig1 \
      fonts-unifont fonts-ubuntu \
      && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir playwright==1.49.1 && playwright install chromium

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8787
EXPOSE 8787

CMD ["python", "server.py"]
