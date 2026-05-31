import os

import joblib
import numpy as np
import torch
import torch.nn as nn
# import torch.optim as optim
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MultiLabelBinarizer

from .ml_model import clean_labels, confirmed_records, MIN_TRAINING_CASES, record_training_text,  build_prediction_text


MODEL_PATH = "diagnosis/dl_model.pt"
VEC_PATH = "diagnosis/dl_vectorizer.pkl"
LABELS_PATH = "diagnosis/labels.pkl"

DL_CONDITION_THRESHOLD = 0.6
DL_CLINICAL_THRESHOLD = 0.45


class DiseaseNet(nn.Module):
    def __init__(self, input_size, num_classes):
        super().__init__()
        self.fc1 = nn.Linear(input_size, 128)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(128, 64)
        self.fc3 = nn.Linear(64, num_classes)

    def forward(self, x):
        x = self.relu(self.fc1(x))
        x = self.relu(self.fc2(x))
        return self.fc3(x)


class ClinicalNet(nn.Module):
    def __init__(self, input_size, head_sizes):
        super().__init__()
        self.fc1 = nn.Linear(input_size, 128)
        self.fc2 = nn.Linear(128, 64)
        self.relu = nn.ReLU()
        self.heads = nn.ModuleDict({
            name: nn.Linear(64, size)
            for name, size in head_sizes.items()
            if size > 0
        })

    def forward(self, x):
        x = self.relu(self.fc1(x))
        x = self.relu(self.fc2(x))
        return {name: head(x) for name, head in self.heads.items()}


def remove_model_file(path):
    if os.path.exists(path):
        os.remove(path)


def build_label_rows(records):
    return {
        "conditions": [
            clean_labels([record.doctor_final_diagnosis])
            for record in records
        ],
        "tests": [
            clean_labels(record.final_tests or record.recommended_tests or [])
            for record in records
        ],
        "meds": [
            clean_labels(record.final_medications or record.recommended_medications or [])
            for record in records
        ],
    }


def fit_binarizer(rows):
    labels = sorted({label for row in rows for label in row})
    if not labels:
        return None, None

    mlb = MultiLabelBinarizer(classes=labels)
    y = mlb.fit_transform(rows)
    return mlb, torch.tensor(y, dtype=torch.float32)


def train_dl_model():
    import torch.optim as optim
    records = list(confirmed_records())

    if len(records) < MIN_TRAINING_CASES:
        return f"Need at least {MIN_TRAINING_CASES} confirmed cases"

    texts = [record_training_text(record) for record in records]
    vectorizer = TfidfVectorizer(max_features=500, ngram_range=(1, 2))
    X = torch.tensor(vectorizer.fit_transform(texts).toarray(), dtype=torch.float32)

    label_rows = build_label_rows(records)
    label_metadata = {}
    targets = {}
    head_sizes = {}

    for head_name, rows in label_rows.items():
        mlb, y = fit_binarizer(rows)
        if mlb is None:
            continue

        label_metadata[head_name] = list(mlb.classes_)
        targets[head_name] = y
        head_sizes[head_name] = len(mlb.classes_)

    if not head_sizes:
        remove_model_file(MODEL_PATH)
        remove_model_file(VEC_PATH)
        remove_model_file(LABELS_PATH)
        return "No labels available for DL training"

    model = ClinicalNet(X.shape[1], head_sizes)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    for _ in range(80):
        outputs = model(X)
        loss = sum(
            criterion(outputs[head_name], targets[head_name])
            for head_name in outputs
        )

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    torch.save(model.state_dict(), MODEL_PATH)
    joblib.dump(vectorizer, VEC_PATH)
    joblib.dump({
        "heads": head_sizes,
        "labels": label_metadata,
        "train_size": len(records),
    }, LABELS_PATH)

    return "DL clinical model trained"


def top_multilabel_predictions(scores, labels, threshold, top_k):
    ranked_indices = np.argsort(scores)[::-1]
    predictions = []

    for index in ranked_indices:
        if scores[index] < threshold:
            continue

        predictions.append(str(labels[index]))
        if len(predictions) >= top_k:
            break

    return predictions


def predict_legacy_dl(symptoms, vectorizer, labels):
    X = vectorizer.transform([symptoms]).toarray()
    X = torch.tensor(X, dtype=torch.float32)

    model = DiseaseNet(X.shape[1], len(labels))
    model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
    model.eval()

    with torch.no_grad():
        outputs = model(X)
        probabilities = torch.softmax(outputs, dim=1).numpy()[0]

    best_index = int(np.argmax(probabilities))
    if probabilities[best_index] < DL_CONDITION_THRESHOLD:
        return {"conditions": [], "tests": [], "meds": []}

    return {"conditions": [str(labels[best_index])], "tests": [], "meds": []}

RENDER_ENV = os.getenv("RENDER") == "true"
def predict_dl(symptoms,medical_features=None, urgency=""):
    if RENDER_ENV:
        print("Skipping DL model on Render free tier")
        return {
            "conditions": [],
            "tests": [],
            "meds": []
        }
    
    try:
        if not all(os.path.exists(path) for path in (MODEL_PATH, VEC_PATH, LABELS_PATH)):
            return {"conditions": [], "tests": [], "meds": []}

        vectorizer = joblib.load(VEC_PATH)
        metadata = joblib.load(LABELS_PATH)

        if isinstance(metadata, list):
            return predict_legacy_dl(symptoms, vectorizer, metadata)

        prediction_text = (
            build_prediction_text(
                symptoms,
                medical_features,
                urgency
            )
        )

        X = vectorizer.transform(
            [prediction_text]
        ).toarray()

        X = torch.tensor(
            X,
            dtype=torch.float32
        )

        model = ClinicalNet(X.shape[1], metadata["heads"])
        model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
        model.eval()

        with torch.no_grad():
            outputs = model(X)

        predictions = {"conditions": [], "tests": [], "meds": []}

        for head_name, output in outputs.items():
            scores = torch.sigmoid(output).numpy()[0]
            threshold = (
                DL_CONDITION_THRESHOLD
                if head_name == "conditions"
                else DL_CLINICAL_THRESHOLD
            )
            top_k = 3 if head_name == "conditions" else 5
            predictions[head_name] = top_multilabel_predictions(
                scores,
                metadata["labels"][head_name],
                threshold,
                top_k,
            )

        return predictions

    except Exception as exc:
        print("DL prediction skipped:", exc)
        return {"conditions": [], "tests": [], "meds": []}
