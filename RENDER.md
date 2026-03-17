# Deploy on Render

## 1. Push code to GitHub

Render deploys from your repository, so push this project first.

## 2. Create Web Service

Option A: Blueprint (recommended)
1. In Render dashboard, choose **New +** -> **Blueprint**.
2. Connect your repo.
3. Render will detect `render.yaml` and configure service automatically.

Option B: Manual Web Service
1. Runtime: **Python**
2. Build Command: `pip install -r requirements.txt`
3. Start Command: `gunicorn -c gunicorn.conf.py wsgi:application`
4. Health Check Path: `/health`

## 3. Set Required Environment Variables

- `APP_SECRET_KEY` -> strong random secret
- `MONGODB_URI` -> MongoDB Atlas connection string
- `MONGODB_DB` -> `food_donation_platform`
- `COOKIE_SECURE` -> `1`
- `FLASK_DEBUG` -> `0`

## 4. MongoDB for Render

Render does not provide native MongoDB service in all plans/regions. Use **MongoDB Atlas** and paste Atlas URI in `MONGODB_URI`.

## 5. Verify Deployment

- Open your Render URL.
- Check health endpoint: `/health`
- If web sockets are used, keep Gunicorn worker as configured in `gunicorn.conf.py`.
