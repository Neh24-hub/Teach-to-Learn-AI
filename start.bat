@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies for first run...
  call npm install
)
if not exist .env (
  copy .env.example .env >nul
  echo.
  echo Created .env. Add your OpenAI API key before using live AI.
  echo.
)
start "" http://localhost:3000
npm start
