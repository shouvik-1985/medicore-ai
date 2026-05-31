import os
import pickle
import warnings

import faiss
import joblib
import numpy as np
from records.models import DiagnosisRecord
#from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import MultiLabelBinarizer


clinical_vectorizer = None
clinical_model_cache = {}
clinical_last_loaded = None
faiss_cache = None
faiss_last_loaded = None

MODEL_PATH = "diagnosis/model.pkl"
DISEASE_VEC_PATH = "diagnosis/disease_vectorizer.pkl"

CONDITION_MODEL_PATH = "diagnosis/condition_model.pkl"
TEST_MODEL_PATH = "diagnosis/test_model.pkl"
MED_MODEL_PATH = "diagnosis/med_model.pkl"
CLINICAL_VEC_PATH = "diagnosis/clinical_vectorizer.pkl"

INDEX_PATH = "diagnosis/faiss_index.pkl"
SIMILAR_CASE_MAX_DISTANCE = 0.55

MIN_TRAINING_CASES = 5
PREDICTION_CONFIDENCE_THRESHOLD = 0.55
CONDITION_CONFIDENCE_THRESHOLD = 0.45
CLINICAL_CONFIDENCE_THRESHOLD = 0.45


def clean_labels(items):
    if not items:
        return []

    if isinstance(items, str):
        items = [items]

    labels = []
    seen = set()
    for item in items:
        label = str(item or "").strip()
        key = label.lower()
        if label and key not in seen:
            labels.append(label)
            seen.add(key)

    return labels


def remove_model_file(path):
    if os.path.exists(path):
        os.remove(path)


def confirmed_records():
    return DiagnosisRecord.objects.filter(
        doctor_confirmed=True,
        doctor_final_diagnosis__isnull=False,
    ).exclude(doctor_final_diagnosis="").exclude(symptoms="")


def record_training_text(record):
    """
    Build structured medical
    training representation.
    """

    text = str(
        record.analysis_context
        or record.symptoms
        or ""
    ).strip()

    medical = (
        record.medical_features
        or {}
    )

    primary_symptoms = " ".join(
        medical.get(
            "primary_symptoms",
            []
        )
    )

    secondary_symptoms = " ".join(
        medical.get(
            "secondary_symptoms",
            []
        )
    )

    body_regions = " ".join(
        medical.get(
            "body_regions",
            []
        )
    )

    trigger_factors = " ".join(
        medical.get(
            "trigger_factors",
            []
        )
    )

    risk_flags = " ".join(
        medical.get(
            "risk_flags",
            []
        )
    )

    severity = medical.get(
        "severity",
        ""
    )

    urgency = str(
        record.urgency or ""
    ).lower()

    if "high" in urgency:
        urgency = "High"

    elif "moderate" in urgency:
        urgency = "Moderate"

    elif "emergency" in urgency:
        urgency = "Emergency"

    else:
        urgency = "Low"

    return f"""
    {text}

    primary_symptoms:
    {primary_symptoms}

    secondary_symptoms:
    {secondary_symptoms}

    body_regions:
    {body_regions}

    trigger_factors:
    {trigger_factors}

    risk_flags:
    {risk_flags}

    severity:
    {severity}

    urgency:
    {urgency}
    """

def build_prediction_text(
    symptoms,
    medical_features=None,
    urgency=""
):
    """
    Convert live patient case
    into training-compatible text.
    """

    medical_features = (
        medical_features
        or {}
    )

    primary_symptoms = " ".join(
        medical_features.get(
            "primary_symptoms",
            []
        )
    )

    secondary_symptoms = " ".join(
        medical_features.get(
            "secondary_symptoms",
            []
        )
    )

    body_regions = " ".join(
        medical_features.get(
            "body_regions",
            []
        )
    )

    trigger_factors = " ".join(
        medical_features.get(
            "trigger_factors",
            []
        )
    )

    risk_flags = " ".join(
        medical_features.get(
            "risk_flags",
            []
        )
    )

    severity = medical_features.get(
        "severity",
        ""
    )

    return f"""
    {symptoms}

    primary_symptoms:
    {primary_symptoms}

    secondary_symptoms:
    {secondary_symptoms}

    body_regions:
    {body_regions}

    trigger_factors:
    {trigger_factors}

    risk_flags:
    {risk_flags}

    severity:
    {severity}

    urgency:
    {urgency}
    """


def train_model():
    data = confirmed_records()

    if data.count() < MIN_TRAINING_CASES:
        return f"Need at least {MIN_TRAINING_CASES} confirmed cases"

    texts = [record_training_text(record) for record in data]
    labels = [str(record.doctor_final_diagnosis).strip() for record in data]

    if len(set(labels)) < 2:
        remove_model_file(MODEL_PATH)
        remove_model_file(DISEASE_VEC_PATH)
        return "Need at least 2 different confirmed diagnoses"

    vectorizer = TfidfVectorizer(max_features=5000, ngram_range=(1, 2))
    X = vectorizer.fit_transform(texts)

    model = LogisticRegression(max_iter=500, class_weight="balanced")
    model.fit(X, labels)

    joblib.dump(model, MODEL_PATH)
    joblib.dump(vectorizer, DISEASE_VEC_PATH)

    return "Condition classifier trained"


def predict_disease(symptoms):
    try:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(DISEASE_VEC_PATH):
            return None

        model = joblib.load(MODEL_PATH)
        vectorizer = joblib.load(DISEASE_VEC_PATH)
        X = vectorizer.transform([symptoms])

        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(X)[0]
            best_index = int(np.argmax(probabilities))

            if probabilities[best_index] < PREDICTION_CONFIDENCE_THRESHOLD:
                return None

            return str(model.classes_[best_index])

        return str(model.predict(X)[0])
    except Exception as exc:
        print("Disease prediction skipped:", exc)
        return None


def condition_labels_for_record(record):
    return clean_labels([record.doctor_final_diagnosis])


def train_multilabel_model(X, label_rows, path):
    all_labels = sorted({label for row in label_rows for label in row})
    valid_labels = []

    for label in all_labels:
        positive_count = sum(label in row for row in label_rows)
        if 0 < positive_count < len(label_rows):
            valid_labels.append(label)

    if not valid_labels:
        remove_model_file(path)
        return False

    filtered_rows = [
        [label for label in row if label in valid_labels]
        for row in label_rows
    ]

    mlb = MultiLabelBinarizer(classes=valid_labels)
    y = mlb.fit_transform(filtered_rows)

    model = OneVsRestClassifier(
        LogisticRegression(max_iter=500, class_weight="balanced")
    )
    model.fit(X, y)

    joblib.dump({"model": model, "mlb": mlb}, path)
    return True


def train_clinical_model():
    data = list(confirmed_records())

    if len(data) < MIN_TRAINING_CASES:
        return f"Need at least {MIN_TRAINING_CASES} confirmed cases"

    texts = [record_training_text(record) for record in data]
    vectorizer = TfidfVectorizer(max_features=5000, ngram_range=(1, 2))
    X = vectorizer.fit_transform(texts)

    condition_rows = [condition_labels_for_record(record) for record in data]
    test_rows = [
        clean_labels(record.final_tests or record.recommended_tests or [])
        for record in data
    ]
    med_rows = [
        clean_labels(record.final_medications or record.recommended_medications or [])
        for record in data
    ]

    trained_conditions = train_multilabel_model(X, condition_rows, CONDITION_MODEL_PATH)
    trained_tests = train_multilabel_model(X, test_rows, TEST_MODEL_PATH)
    trained_meds = train_multilabel_model(X, med_rows, MED_MODEL_PATH)
    joblib.dump(vectorizer, CLINICAL_VEC_PATH)

    trained_parts = []
    if trained_conditions:
        trained_parts.append("conditions")
    if trained_tests:
        trained_parts.append("tests")
    if trained_meds:
        trained_parts.append("medications")

    return f"Clinical model trained for: {', '.join(trained_parts) or 'none'}"


def predict_multilabel(path, X, threshold, top_k=5):
    if not os.path.exists(path):
        return []

    data = joblib.load(path)

    if isinstance(data, tuple):
        model, mlb = data
    else:
        model = data["model"]
        mlb = data["mlb"]

    probabilities = model.predict_proba(X)
    if isinstance(probabilities, list):
        probabilities = np.array(
            [
                proba[:, 1] if proba.shape[1] > 1 else proba[:, 0]
                for proba in probabilities
            ]
        ).T

    scores = probabilities[0]
    ranked_indices = np.argsort(scores)[::-1]

    labels = []
    for index in ranked_indices:
        if scores[index] < threshold:
            continue
        labels.append(str(mlb.classes_[index]))
        if len(labels) >= top_k:
            break

    return labels


def predict_clinical(symptoms, medical_features=None, urgency=""):
    global clinical_vectorizer, clinical_last_loaded, clinical_model_cache

    if not os.path.exists(CLINICAL_VEC_PATH):
        print("⚠️ ML model not trained yet")
        return {"conditions": [], "tests": [], "meds": []}

    try:
        current_time = os.path.getmtime(CLINICAL_VEC_PATH)

        # reload only if updated
        if clinical_vectorizer is None or clinical_last_loaded != current_time:
            print("🔄 Reloading ML model...")

            clinical_vectorizer = joblib.load(CLINICAL_VEC_PATH)

            clinical_model_cache = {
                "condition": joblib.load(CONDITION_MODEL_PATH) if os.path.exists(CONDITION_MODEL_PATH) else None,
                "test": joblib.load(TEST_MODEL_PATH) if os.path.exists(TEST_MODEL_PATH) else None,
                "med": joblib.load(MED_MODEL_PATH) if os.path.exists(MED_MODEL_PATH) else None,
            }

            clinical_last_loaded = current_time

        prediction_text = (
            build_prediction_text(
                symptoms,
                medical_features,
                urgency
            )
        )

        X = clinical_vectorizer.transform(
            [prediction_text]
        )

        return {
            "conditions": predict_multilabel(
                CONDITION_MODEL_PATH, X, CONDITION_CONFIDENCE_THRESHOLD, top_k=3
            ),
            "tests": predict_multilabel(
                TEST_MODEL_PATH, X, CLINICAL_CONFIDENCE_THRESHOLD, top_k=5
            ),
            "meds": predict_multilabel(
                MED_MODEL_PATH, X, CLINICAL_CONFIDENCE_THRESHOLD, top_k=5
            ),
        }

    except Exception as exc:
        print("Clinical prediction error:", exc)
        return {"conditions": [], "tests": [], "meds": []}


EMB_MODEL = None


def get_embedding_model():
    if os.getenv("RENDER") == "true":
        print("Skipping sentence transformer on Render")
        return None
    
    global EMB_MODEL

    if EMB_MODEL is None:
        from sentence_transformers import SentenceTransformer

        os.environ.setdefault(
            "TRANSFORMERS_VERBOSITY",
            "error"
        )

        warnings.filterwarnings(
            "ignore",
            module="transformers"
        )

        EMB_MODEL = SentenceTransformer(
            "all-MiniLM-L6-v2",
            token=os.getenv("HF_TOKEN"),
        )

    return EMB_MODEL


def build_faiss_index():
    records = list(confirmed_records())
    texts = [record_training_text(record) for record in records]

    if not texts:
        remove_model_file(INDEX_PATH)
        return

    embeddings = get_embedding_model().encode(texts)
    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(np.array(embeddings))

    metadata = [
        {
            "tests": clean_labels(record.final_tests or []),
            "meds": clean_labels(record.final_medications or []),
            "condition": str(record.doctor_final_diagnosis).strip(),
        }
        for record in records
    ]

    with open(INDEX_PATH, "wb") as file:
        pickle.dump((index, metadata), file)


def retrieve_similar(symptoms,  medical_features=None, urgency="", k=3):
    try:
        if not os.path.exists(INDEX_PATH):
            return [], [], []

        global faiss_cache, faiss_last_loaded

        current_time = os.path.getmtime(INDEX_PATH)
        if faiss_cache is None or faiss_last_loaded != current_time:
            print("🔄 Reloading FAISS index...")
            with open(INDEX_PATH, "rb") as file:
                faiss_cache = pickle.load(file)
            faiss_last_loaded = current_time
        index, metadata = faiss_cache
        
        model = get_embedding_model()
        if model is None:
            return [], [], []
        prediction_text = (
            build_prediction_text(
                symptoms,
                medical_features,
                urgency
            )
        )

        query = model.encode(
            [prediction_text]
        )
        distances, indices = index.search(np.array(query), k)

        tests = []
        meds = []
        similar_cases = []

        for position, metadata_index in enumerate(indices[0]):
            if metadata_index >= len(metadata):
                continue

            distance = distances[0][position]
            if distance > SIMILAR_CASE_MAX_DISTANCE:
                continue
            # ❌ remove unrelated weak matches
            if distance > 0.65 and len(similar_cases) > 0:
                continue

            weight = 3 if distance < 0.5 else 2
            case = metadata[metadata_index]
            condition = str(case.get("condition") or "").strip()
            if not condition:
                continue

            tests += clean_labels(case.get("tests", [])) * weight
            meds += clean_labels(case.get("meds", [])) * weight
            similar_cases.append({
                "condition": condition,
                "tests": clean_labels(case.get("tests", [])),
                "meds": clean_labels(case.get("meds", [])),
                "distance": float(distance),
            })

        return tests, meds, similar_cases

    except Exception as exc:
        print("FAISS error:", exc)
        return [], [], []
