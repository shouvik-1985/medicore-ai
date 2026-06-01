import base64
import io
import os
import re
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from typing import Dict, List

from django.core.files.uploadedfile import UploadedFile
from django.conf import settings
from openai import OpenAI

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    cv2 = None

try:
    from docx import Document as DocxDocument  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    DocxDocument = None


openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
PDF_EXTENSIONS = {".pdf"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".mpeg", ".mpga", ".flac", ".aac"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".m4v", ".webm"}
DOCUMENT_EXTENSIONS = {".doc", ".docx"}
DOCUMENT_MIME_TYPES = {
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def truncate_text(value: str, limit: int = 3000) -> str:
    text = collapse_whitespace(value)
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def read_upload_bytes(uploaded_file: UploadedFile) -> bytes:
    uploaded_file.seek(0)
    data = uploaded_file.read()
    uploaded_file.seek(0)
    return data


def detect_media_type(uploaded_file: UploadedFile) -> str:
    content_type = str(getattr(uploaded_file, "content_type", "") or "").lower()
    extension = os.path.splitext(str(uploaded_file.name or ""))[1].lower()

    if content_type.startswith("image/") or extension in IMAGE_EXTENSIONS:
        return "image"
    if content_type == "application/pdf" or extension in PDF_EXTENSIONS:
        return "pdf"
    if content_type.startswith("audio/") or extension in AUDIO_EXTENSIONS:
        return "audio"
    if content_type.startswith("video/") or extension in VIDEO_EXTENSIONS:
        return "video"
    if content_type in DOCUMENT_MIME_TYPES or extension in DOCUMENT_EXTENSIONS:
        return "document"
    return "unknown"


def message_text(response) -> str:
    content = response.choices[0].message.content

    if isinstance(content, str):
        return content.strip()

    parts = []
    for item in content or []:
        if isinstance(item, dict):
            text_value = item.get("text")
            if text_value:
                parts.append(str(text_value))
            continue

        text_value = getattr(item, "text", None)
        if text_value:
            parts.append(str(text_value))

    return "\n".join(parts).strip()


def summarize_image(uploaded_file: UploadedFile) -> str:
    file_bytes = read_upload_bytes(uploaded_file)
    mime_type = str(getattr(uploaded_file, "content_type", "") or "image/jpeg")
    encoded = base64.b64encode(file_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{encoded}"

    response = openai_client.chat.completions.create(
        model="gpt-5.4-mini",
        temperature=0.2,
        messages=[
            {
                "role": "system",
                "content": (
                    "You summarize clinically relevant findings from patient-provided images. "
                    "Describe only what is visibly present, mention uncertainty, and do not invent a diagnosis."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Summarize the medically relevant findings visible in this image. "
                            "Mention body area, visible abnormalities, text in the image, and short caution notes. "
                            "Return plain text in under 120 words."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url, "detail": "high"},
                    },
                ],
            },
        ],
    )

    return truncate_text(message_text(response), 1200)


def summarize_pdf(uploaded_file: UploadedFile) -> str:
    file_bytes = read_upload_bytes(uploaded_file)
    encoded = base64.b64encode(file_bytes).decode("utf-8")

    response = openai_client.chat.completions.create(
        model="gpt-5.4-mini",
        temperature=0.2,
        messages=[
            {
                "role": "system",
                "content": (
                    "You summarize medically relevant content from uploaded PDF documents. "
                    "Extract key symptoms, test results, diagnoses, medications, measurements, and warnings."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Review this PDF and produce a concise medical summary in plain text. "
                            "Highlight symptoms, reported diagnoses, test results, medications, abnormal values, "
                            "and any urgent red flags. If the PDF is not medical, say that clearly."
                        ),
                    },
                    {
                        "type": "file",
                        "file": {
                            "filename": str(uploaded_file.name or "document.pdf"),
                            "file_data": encoded,
                        },
                    },
                ],
            },
        ],
    )

    return truncate_text(message_text(response), 1500)


def extract_docx_text(file_bytes: bytes) -> str:
    if DocxDocument is not None:
        try:
            document = DocxDocument(io.BytesIO(file_bytes))
            paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
            if paragraphs:
                return "\n".join(paragraphs)
        except Exception:
            pass

    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            xml_bytes = archive.read("word/document.xml")
    except Exception:
        return ""

    try:
        namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        root = ET.fromstring(xml_bytes)
        texts = [node.text.strip() for node in root.findall(".//w:t", namespace) if node.text and node.text.strip()]
        return "\n".join(texts)
    except Exception:
        return ""


def extract_legacy_doc_text(file_bytes: bytes) -> str:
    candidates = []
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            decoded = file_bytes.decode(encoding, errors="ignore")
        except Exception:
            continue

        cleaned = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", " ", decoded)
        cleaned = re.sub(r"[^\S\r\n]+", " ", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
        if len(cleaned) >= 40:
            candidates.append(cleaned)

    if not candidates:
        return ""

    return max(candidates, key=len)


def summarize_document(uploaded_file: UploadedFile) -> str:
    file_bytes = read_upload_bytes(uploaded_file)
    extension = os.path.splitext(str(uploaded_file.name or ""))[1].lower()

    if extension == ".docx":
        extracted_text = extract_docx_text(file_bytes)
    else:
        extracted_text = extract_legacy_doc_text(file_bytes)

    if not extracted_text:
        return (
            "Document uploaded, but readable text could not be extracted. "
            "If this is a legacy .doc file, converting it to .docx or PDF usually works better."
        )

    response = openai_client.chat.completions.create(
        model="gpt-5.4-mini",
        temperature=0.2,
        messages=[
            {
                "role": "system",
                "content": (
                    "You summarize medically relevant content from uploaded Word documents. "
                    "Extract symptoms, diagnoses, tests, medications, measurements, timelines, and warnings."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Summarize this medical document in plain text. Highlight symptoms, diagnoses, "
                    "test results, medications, abnormal values, timelines, and red flags. "
                    "If the document is not medical, say that clearly.\n\n"
                    f"DOCUMENT TEXT:\n{truncate_text(extracted_text, 7000)}"
                ),
            },
        ],
    )

    return truncate_text(message_text(response), 1500)


def transcribe_audio(uploaded_file: UploadedFile) -> str:
    uploaded_file.seek(0)

    try:
        response = openai_client.audio.transcriptions.create(
            model="gpt-4o-mini-transcribe",
            file=uploaded_file,
        )
    except Exception:
        uploaded_file.seek(0)
        response = openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=uploaded_file,
        )

    uploaded_file.seek(0)
    return truncate_text(getattr(response, "text", "") or "", 2000)


def extract_video_frames(uploaded_file: UploadedFile, max_frames: int = 4) -> List[str]:
    if cv2 is None:
        return []

    file_bytes = read_upload_bytes(uploaded_file)
    suffix = os.path.splitext(str(uploaded_file.name or ""))[1].lower() or ".mp4"
    temp_path = None
    frames: List[str] = []

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(file_bytes)
            temp_path = temp_file.name

        capture = cv2.VideoCapture(temp_path)
        if not capture.isOpened():
            return []

        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if total_frames <= 0:
            total_frames = max_frames

        positions = sorted(
            {
                min(total_frames - 1, max(0, int(total_frames * ratio)))
                for ratio in [0.1, 0.35, 0.6, 0.85][:max_frames]
            }
        )

        for position in positions:
            capture.set(cv2.CAP_PROP_POS_FRAMES, position)
            success, frame = capture.read()
            if not success:
                continue

            success, buffer = cv2.imencode(".jpg", frame)
            if not success:
                continue

            frames.append(base64.b64encode(buffer.tobytes()).decode("utf-8"))

        capture.release()
        return frames
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def summarize_video_frames(frame_payloads: List[str]) -> str:
    if not frame_payloads:
        return ""

    content = [
        {
            "type": "text",
            "text": (
                "These are sampled frames from a patient-provided video. "
                "Summarize clinically relevant visible findings only: motion difficulty, swelling, breathing effort, "
                "skin changes, visible injuries, or monitor text. Mention uncertainty. Plain text only."
            ),
        }
    ]

    for frame in frame_payloads:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{frame}", "detail": "high"},
            }
        )

    response = openai_client.chat.completions.create(
        model="gpt-5.4-mini",
        temperature=0.2,
        messages=[
            {
                "role": "system",
                "content": "You summarize clinically relevant findings from sampled video frames.",
            },
            {"role": "user", "content": content},
        ],
    )

    return truncate_text(message_text(response), 1200)


def summarize_video(uploaded_file: UploadedFile) -> str:
    transcript = ""
    transcript_error = None

    try:
        transcript = transcribe_audio(uploaded_file)
    except Exception as exc:
        transcript_error = str(exc)

    frame_summary = ""
    try:
        frame_summary = summarize_video_frames(extract_video_frames(uploaded_file))
    except Exception:
        frame_summary = ""

    parts = []
    if transcript:
        parts.append(f"Audio transcript: {transcript}")
    if frame_summary:
        parts.append(f"Visual summary: {frame_summary}")
    if not parts and transcript_error:
        parts.append(f"Video processing note: {transcript_error}")
    if not parts:
        parts.append("Video uploaded, but no clinically relevant content could be extracted.")

    return truncate_text("\n".join(parts), 2000)


def extract_file_context(uploaded_file: UploadedFile) -> Dict[str, str]:
    media_type = detect_media_type(uploaded_file)
    file_bytes = read_upload_bytes(uploaded_file)

    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"{uploaded_file.name} is larger than 25 MB, which exceeds the current analysis limit."
        )

    if media_type == "image":
        summary = summarize_image(uploaded_file)
    elif media_type == "pdf":
        summary = summarize_pdf(uploaded_file)
    elif media_type == "audio":
        summary = transcribe_audio(uploaded_file)
    elif media_type == "video":
        summary = summarize_video(uploaded_file)
    elif media_type == "document":
        summary = summarize_document(uploaded_file)
    else:
        raise ValueError(
            f"{uploaded_file.name} has an unsupported format. Please upload an image, PDF, Word document, audio, or video file."
        )

    return {
        "media_type": media_type,
        "name": str(uploaded_file.name or "attachment"),
        "summary": summary or "No extractable medical context found.",
    }


def build_multimodal_case_payload(symptoms: str, uploaded_files: List[UploadedFile]) -> Dict[str, object]:
    attachments = [extract_file_context(uploaded_file) for uploaded_file in uploaded_files]

    sections = []
    if collapse_whitespace(symptoms):
        sections.append(f"User text input:\n{collapse_whitespace(symptoms)}")

    for index, attachment in enumerate(attachments, start=1):
        label = f"{attachment['media_type'].upper()} FILE {index}: {attachment['name']}"
        sections.append(f"{label}\n{attachment['summary']}")

    analysis_context = "\n\n".join(section for section in sections if section).strip()
    analysis_context = truncate_text(analysis_context, 12000)

    display_text = collapse_whitespace(symptoms)
    if not display_text:
        preview_parts = [
            f"{attachment['media_type']}: {truncate_text(attachment['summary'], 160)}"
            for attachment in attachments
        ]
        display_text = truncate_text(" | ".join(preview_parts), 3000)

    modalities = []
    if collapse_whitespace(symptoms):
        modalities.append("text")
    modalities.extend(
        attachment["media_type"]
        for attachment in attachments
        if attachment["media_type"] not in modalities
    )

    return {
        "analysis_context": analysis_context,
        "display_text": display_text,
        "input_modalities": modalities,
        "uploaded_file_names": [attachment["name"] for attachment in attachments],
        "attachments": attachments,
    }
