For celery

first terminal:- python -m celery -A ai_backend worker -l info
another terminal:- python -m celery -A ai_backend beat -l info

command for ai_service - uvicorn app:app --reload --port 8001