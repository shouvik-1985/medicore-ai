from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import traceback

# ML / DL
from models.ml_model import (
    predict_disease,
    predict_clinical,
    retrieve_similar,
    build_prediction_text,
)

from models.dl_model import (
    predict_dl
)

# Medical intelligence
from medical.medical_extractor import (
    extract_medical_features
)

from medical.rule_engine import (
    medical_rule_engine
)

from medical.confidence_engine import (
    calculate_confidence
)

from medical.medical_mapper import (
    normalize_conditions
)

from medical.reasoning_engine import (
    rerank_conditions
)


app = FastAPI()


class PredictRequest(BaseModel):
    symptoms: str
    history: Optional[str] = ""
    role: str = "patient"


@app.get("/")
def health():
    return {
        "status": "ok",
        "service": "MediCore AI"
    }


@app.post("/predict")
def predict(
    data: PredictRequest
):
    try:
        case_text = data.symptoms
        role = data.role
        history = data.history

        # ======================
        # Medical extraction
        # ======================

        extracted_features = (
            extract_medical_features(
                case_text
            )
        )

        rule_result = (
            medical_rule_engine(
                extracted_features
            )
        )

        # ======================
        # ML
        # ======================

        ml_output = (
            predict_clinical(
                case_text,
                extracted_features,
                rule_result[
                    "urgency"
                ]
            )
        )

        # ======================
        # DL
        # ======================

        dl_output = (
            predict_dl(
                case_text,
                extracted_features,
                rule_result[
                    "urgency"
                ]
            )
        )

        # ======================
        # FAISS retrieval
        # ======================

        sim_tests, sim_meds, faiss_cases = (
            retrieve_similar(
                case_text,
                extracted_features,
                rule_result[
                    "urgency"
                ]
            )
        )

        # ======================
        # ML prediction
        # ======================

        ml_prediction = (
            predict_disease(
                build_prediction_text(
                    case_text,
                    extracted_features,
                    rule_result[
                        "urgency"
                    ]
                )
            )
        )

        return {
            "extracted_features":
                extracted_features,

            "rule_result":
                rule_result,

            "ml_output":
                ml_output,

            "dl_output":
                dl_output,

            "faiss_cases":
                faiss_cases,

            "sim_tests":
                sim_tests,

            "sim_meds":
                sim_meds,

            "clinical_support":
                ml_output,

            "dl_support":
                dl_output,

            "similar_cases":
                faiss_cases,

            "ml_prediction":
                ml_prediction,
        }

    except Exception as e:
        print(traceback.format_exc())

        return {
            "error": str(e)
        }