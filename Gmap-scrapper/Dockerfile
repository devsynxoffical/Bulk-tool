FROM --platform=linux/amd64 mcr.microsoft.com/playwright/python:v1.49.1-focal

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8787
EXPOSE 8787

CMD ["python", "server.py"]
