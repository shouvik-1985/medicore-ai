from pathlib import Path
import os
import sys
from datetime import timedelta
from dotenv import load_dotenv
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

# 🔥 ADD THIS
sys.path.insert(0, str(BASE_DIR.parent))

load_dotenv(BASE_DIR / ".env")

AI_SERVICE_URL = os.getenv(
    "AI_SERVICE_URL",
    default=
    "http://localhost:8001"
)

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
RAZORPAYX_ACCOUNT_NUMBER = "41252788350"

STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
HF_API_KEY = os.getenv("HF_API_KEY")
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER
CELERY_BROKER_URL = os.getenv("REDIS_URL")
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_BACKEND = os.getenv(
    "REDIS_URL"
)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
DEBUG = os.getenv("DEBUG", "False") == "True"
ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    ".onrender.com",
    ".vercel.app",
    "medicore-backend-rw6m.onrender.com",
]

if os.getenv("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(
        os.getenv(
            "RENDER_EXTERNAL_HOSTNAME"
        )
    )
INSTALLED_APPS = [
    'django_celery_results',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'auth_app',
    'diagnosis',
    'records',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'ai_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'ai_backend.wsgi.application'



# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.postgresql',
#         'NAME': 'ai_diagnosis_db',
#         'USER': 'postgres',
#         'PASSWORD': 'diagnosis#1985',
#         'HOST': 'localhost',
#         'PORT': '5432',
#     }
# }

DATABASES = {
    "default": dj_database_url.parse(
        os.getenv("SUPABASE_DB_URL"),
        conn_max_age=600,
        ssl_require=True
    )
}

AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True
STATIC_URL = '/static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

CELERY_BEAT_SCHEDULE = {
    'send-reminder-daily': {
        'task': 'auth_app.tasks.check_and_send_reminders',
        'schedule': 60.0,  
    },

    'cleanup-expired-busy-slots': {
    'task': 'auth_app.tasks.cleanup_expired_busy_slots',
    'schedule': 300.0,
    },
}

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:8080",
    "https://medicore-ai-six.vercel.app",
]

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

if os.getenv("FRONTEND_URL"):
    CORS_ALLOWED_ORIGINS.append(
        os.getenv("FRONTEND_URL")
    )

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:8080",
    "https://medicore-ai-six.vercel.app",
    "https://medicore-backend-rw6m.onrender.com",
]

if os.getenv("FRONTEND_URL"):
    CSRF_TRUSTED_ORIGINS.append(
        os.getenv("FRONTEND_URL")
    )

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
}

STATICFILES_STORAGE = (
    "whitenoise.storage.CompressedManifestStaticFilesStorage"
)

IS_PRODUCTION = (
    os.getenv("RENDER_EXTERNAL_HOSTNAME")
)

# only enable HTTPS on Render
if IS_PRODUCTION:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
else:
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": os.getenv("REDIS_URL"),
        "OPTIONS": {
            "CLIENT_CLASS":
            "django_redis.client.DefaultClient",
        }
    }
}

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID"
)